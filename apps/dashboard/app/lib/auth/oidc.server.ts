import * as oidc from "openid-client";
import { createCookie } from "react-router";
import { getOidcConfiguration, type OidcConfiguration } from "./oidc-config.server";
import { getSafeDashboardReturnTo } from "./return-to.server";

const MAX_SUBJECT_LENGTH = 255;
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 200;

type OidcTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

export type OidcProfile = {
  provider: string;
  subject: string;
  email: string;
  displayName: string | null;
};

type OidcStartResult = {
  authorizationUrl: string;
  setCookie: string;
};

type OidcCompletionResult = {
  profile: OidcProfile;
  returnTo: string;
  clearCookie: string;
};

export type OidcAuthenticationErrorCode =
  | "sign_in_cancelled"
  | "sign_in_expired"
  | "invalid_identity"
  | "email_not_verified"
  | "provider_unavailable";

export class OidcAuthenticationError extends Error {
  constructor(
    readonly code: OidcAuthenticationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OidcAuthenticationError";
  }
}

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getDashboardSessionSecret() {
  const secret = getRequiredEnvironmentVariable("DASHBOARD_SESSION_SECRET");

  if (secret.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be at least 32 characters");
  }

  return secret;
}

function getOidcTransactionCookie() {
  const production = process.env["NODE_ENV"] === "production";

  return createCookie(production ? "__Host-cascade-oidc" : "cascade-oidc", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: production,
    secrets: [getDashboardSessionSecret()],
    maxAge: 10 * 60,
  });
}

export async function clearOidcLoginTransaction() {
  return getOidcTransactionCookie().serialize("", {
    maxAge: 0,
  });
}

async function discoverOidcProvider(config: OidcConfiguration) {
  return oidc.discovery(new URL(config.issuerUrl), config.clientId, config.clientSecret);
}

function getRequiredStringClaim(
  claims: Record<string, unknown>,
  name: string,
  maximumLength: number,
) {
  const value = claims[name];

  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximumLength) {
    throw new OidcAuthenticationError(
      "invalid_identity",
      `OIDC ID token contains an invalid ${name} claim`,
    );
  }

  return value;
}

function getVerifiedEmailClaim(claims: Record<string, unknown>) {
  const email = getRequiredStringClaim(claims, "email", MAX_EMAIL_LENGTH).trim().toLowerCase();

  const emailParts = email.split("@");

  if (emailParts.length !== 2 || !emailParts[0] || !emailParts[1] || /\s/u.test(email)) {
    throw new OidcAuthenticationError(
      "invalid_identity",
      "OIDC ID token contains an invalid email claim",
    );
  }

  if (claims["email_verified"] !== true) {
    throw new OidcAuthenticationError("email_not_verified", "OIDC identity email is not verified");
  }

  return email;
}

function getDisplayNameClaim(claims: Record<string, unknown>) {
  const value = claims["name"];

  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new OidcAuthenticationError(
      "invalid_identity",
      "OIDC ID token contains an invalid name claim",
    );
  }

  const displayName = value.trim();

  if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new OidcAuthenticationError(
      "invalid_identity",
      "OIDC ID token contains an invalid name claim",
    );
  }

  return displayName;
}

export async function startOidcLogin(
  returnTo: string | null | undefined,
): Promise<OidcStartResult> {
  const config = getOidcConfiguration();
  const provider = await discoverOidcProvider(config);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const authorizationUrl = oidc.buildAuthorizationUrl(provider, {
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const transaction: OidcTransaction = {
    state,
    nonce,
    codeVerifier,
    returnTo: getSafeDashboardReturnTo(returnTo),
  };

  return {
    authorizationUrl: authorizationUrl.href,
    setCookie: await getOidcTransactionCookie().serialize(transaction),
  };
}

export async function completeOidcLogin(request: Request): Promise<OidcCompletionResult> {
  const transaction = await getOidcTransactionCookie().parse(request.headers.get("Cookie"));

  if (!isOidcTransaction(transaction)) {
    throw new OidcAuthenticationError(
      "sign_in_expired",
      "OIDC login transaction is missing or invalid",
    );
  }

  const config = getOidcConfiguration();
  const provider = await discoverOidcProvider(config);

  const tokens = await oidc.authorizationCodeGrant(provider, new URL(request.url), {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();

  if (!claims) {
    throw new OidcAuthenticationError(
      "invalid_identity",
      "OIDC provider did not return ID token claims",
    );
  }

  const record = claims as Record<string, unknown>;
  const subject = getRequiredStringClaim(record, "sub", MAX_SUBJECT_LENGTH);
  const email = getVerifiedEmailClaim(record);
  const displayName = getDisplayNameClaim(record);

  return {
    profile: {
      provider: config.issuerUrl,
      subject,
      email,
      displayName,
    },
    returnTo: transaction.returnTo,
    clearCookie: await clearOidcLoginTransaction(),
  };
}

function isOidcTransaction(value: unknown): value is OidcTransaction {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate["state"] === "string" &&
    typeof candidate["nonce"] === "string" &&
    typeof candidate["codeVerifier"] === "string" &&
    typeof candidate["returnTo"] === "string"
  );
}
