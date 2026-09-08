export type OidcConfiguration = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const OIDC_CALLBACK_PATH = "/auth/callback";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parseHttpUrl(name: string, value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }

  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }

  return url;
}

function validateProductionUrl(name: string, url: URL) {
  if (process.env["NODE_ENV"] !== "production") {
    return;
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use https in production`);
  }

  if (LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new Error(`${name} must not use a loopback host in production`);
  }
}

export function getOidcConfiguration(): OidcConfiguration {
  const issuerUrl = getRequiredEnvironmentVariable("OIDC_ISSUER_URL");
  const clientId = getRequiredEnvironmentVariable("OIDC_CLIENT_ID");
  const clientSecret = getRequiredEnvironmentVariable("OIDC_CLEINT_SECRET");
  const redirectUri = getRequiredEnvironmentVariable("OIDC_REDIRECT_URI");

  const issuer = parseHttpUrl("OIDC_ISSUER_URL", issuerUrl);
  const redirect = parseHttpUrl("OIDC_REDIRECT_URI", redirectUri);

  if (issuer.search || issuer.hash) {
    throw new Error("OIDC_ISSUER_URL must not contain a query string or fragment");
  }

  if (redirect.pathname !== OIDC_CALLBACK_PATH || redirect.search || redirect.hash) {
    throw new Error(`OIDC_REDIRECT_URI must point exactly to ${OIDC_CALLBACK_PATH}`);
  }

  validateProductionUrl("OIDC_ISSUER", issuer);
  validateProductionUrl("OIDC_REDIRECT_URI", redirect);

  return {
    issuerUrl,
    clientId,
    clientSecret,
    redirectUri,
  };
}
