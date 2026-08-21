import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const MAX_TOKEN_LIFETIME_SECONDS = 120;
const MAX_CLOCK_SKEW_SECONDS = 30;

export type DashboardApiAuthorizationClaims = {
  userId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  issuedAt: number;
  expiresAt: number;
};

export type CreateDashboardApiAuthorizationInput = Omit<
  DashboardApiAuthorizationClaims,
  "issuedAt" | "expiresAt"
>;

function getSecret(secret: string) {
  if (secret.length < 32) {
    throw new Error("DASHBOARD_API_AUTH_SECRET must be at least 32 characters");
  }

  return secret;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safelyCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.length > 0;
}

function isInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value);
}

function isClaims(value: unknown): value is DashboardApiAuthorizationClaims {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isNonEmptyString(candidate["userId"]) &&
    isNonEmptyString(candidate["organizationId"]) &&
    isNonEmptyString(candidate["projectId"]) &&
    isNonEmptyString(candidate["environmentId"]) &&
    isInteger(candidate["issuedAt"]) &&
    isInteger(candidate["expiresAt"])
  );
}

export function createDashboardApiAuthorization(
  input: CreateDashboardApiAuthorizationInput,
  secret: string,
  now = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + 60;

  const claims: DashboardApiAuthorizationClaims = {
    ...input,
    issuedAt,
    expiresAt,
  };

  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signedValue = `${TOKEN_VERSION}.${payload}`;

  return `${signedValue}.${sign(signedValue, getSecret(secret))}`;
}

export function verifyDashboardApiAuthorization(
  token: string,
  secret: string,
  now = new Date(),
): DashboardApiAuthorizationClaims | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [version, payload, signature] = parts;

  if (
    version !== TOKEN_VERSION ||
    !payload ||
    !signature ||
    !safelyCompare(signature, sign(`${version}.${payload}`, getSecret(secret)))
  ) {
    return null;
  }

  let claims: unknown;

  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }

  if (!isClaims(claims)) {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (
    claims.expiresAt <= nowSeconds ||
    claims.expiresAt - claims.issuedAt > MAX_TOKEN_LIFETIME_SECONDS ||
    claims.issuedAt > nowSeconds + MAX_CLOCK_SKEW_SECONDS
  ) {
    return null;
  }

  return claims;
}
