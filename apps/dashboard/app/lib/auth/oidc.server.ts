import * as oidc from "openid-client";
import { createCookie } from "react-router";

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

export class OidcAuthenticationError extends Error {
  constructor(message: string) {
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

function getOidcConfiguration() {
  return {
    issueUrl: getRequiredEnvironmentVariable("OIDC_ISSUER_URL"),
    clientId: getRequiredEnvironmentVariable("OIDC_CLIENT_ID"),
    clientSecret: getRequiredEnvironmentVariable("OIDC_CLIENT_SECRET"),
    redirectUri: getRequiredEnvironmentVariable("OIDC_REDIRECT_URI"),
  };
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

function normalizeReturnTo(value: string | null | undefined) {
  if (value?.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}

async function discoverOidcProvider() {
  const config = getOidcConfiguration();

  return oidc.discovery(new URL(config.issueUrl), config.clientId, config.clientSecret);
}

function getRequiredClaim(claims: Record<string, unknown>, name: string) {
  const value = claims[name];

  if (typeof value !== "string" || !value) {
    throw new OidcAuthenticationError(`OIDC ID token is missing required ${name} claim`);
  }

  return value;
}

export async function startOidcLogin(
  returnTo: string | null | undefined,
): Promise<OidcStartResult> {
  const provider = await discoverOidcProvider();
  const { redirectUri } = getOidcConfiguration();

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const authorizationUrl = oidc.buildAuthorizationUrl(provider, {
    redirect_uri: redirectUri,
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
    returnTo: normalizeReturnTo(returnTo),
  };

  return {
    authorizationUrl: authorizationUrl.href,
    setCookie: await getOidcTransactionCookie().serialize(transaction),
  };
}

export async function completeOidcLogin(request: Request): Promise<OidcCompletionResult> {
  const transaction = await getOidcTransactionCookie().parse(request.headers.get("Cookie"));

  if (!isOidcTransaction(transaction)) {
    throw new OidcAuthenticationError("OIDC login transaction is missing or invalid");
  }

  const provider = await discoverOidcProvider();

  const tokens = await oidc.authorizationCodeGrant(provider, new URL(request.url), {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();

  if (!claims) {
    throw new OidcAuthenticationError("OIDC provider did not return ID token claims");
  }

  const record = claims as Record<string, unknown>;
  const subject = getRequiredClaim(record, "sub");
  const email = getRequiredClaim(record, "email");
  const name = record["name"];

  return {
    profile: {
      provider: getOidcConfiguration().issueUrl,
      subject,
      email,
      displayName: typeof name === "string" && name ? name : null,
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
