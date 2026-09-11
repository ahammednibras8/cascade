import * as oidc from "openid-client";
import { createCookie } from "react-router";
import { getOidcConfiguration, type OidcConfiguration } from "./oidc-config.server";
import { getSafeDashboardReturnTo } from "./return-to.server";

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
    throw new OidcAuthenticationError("OIDC login transaction is missing or invalid");
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
    throw new OidcAuthenticationError("OIDC provider did not return ID token claims");
  }

  const record = claims as Record<string, unknown>;
  const subject = getRequiredClaim(record, "sub");
  const email = getRequiredClaim(record, "email");
  const name = record["name"];

  return {
    profile: {
      provider: config.issuerUrl,
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
