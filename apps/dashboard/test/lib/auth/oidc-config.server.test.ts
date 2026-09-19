import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOidcConfiguration } from "../../../app/lib/auth/oidc-config.server.js";

const VALID_CONFIGURATION = {
  issuerUrl: "https://identity.example.test",
  clientId: "cascade-dashboard",
  clientSecret: "oidc-client-secret",
  redirectUri: "https://dashboard.example.test/auth/callback",
};

function configureValidOidc() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("OIDC_ISSUER_URL", VALID_CONFIGURATION.issuerUrl);
  vi.stubEnv("OIDC_CLIENT_ID", VALID_CONFIGURATION.clientId);
  vi.stubEnv("OIDC_CLIENT_SECRET", VALID_CONFIGURATION.clientSecret);
  vi.stubEnv("OIDC_REDIRECT_URI", VALID_CONFIGURATION.redirectUri);
}

describe("OIDC configuration", () => {
  beforeEach(() => {
    configureValidOidc();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a complete valid configuration", () => {
    expect(getOidcConfiguration()).toEqual(VALID_CONFIGURATION);
  });

  it.each(["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"])(
    "requires %s",
    (name) => {
      vi.stubEnv(name, " ");

      expect(() => getOidcConfiguration()).toThrow(`${name} is required`);
    },
  );

  it("requires the issuer to be an absolute URL", () => {
    vi.stubEnv("OIDC_ISSUER_URL", "identity.example.test");

    expect(() => getOidcConfiguration()).toThrow("OIDC_ISSUER_URL must be a valid absolute URL");
  });

  it("rejects a non-HTTP issuer", () => {
    vi.stubEnv("OIDC_ISSUER_URL", "ftp://identity.example.test");

    expect(() => getOidcConfiguration()).toThrow("OIDC_ISSUER_URL must use http or https");
  });

  it("rejects credentials embedded in the issuer URL", () => {
    vi.stubEnv("OIDC_ISSUER_URL", "https://user:password@identity.example.test");

    expect(() => getOidcConfiguration()).toThrow("OIDC_ISSUER_URL must not contain credentials");
  });

  it.each([
    "https://identity.example.test?tenant=cascade",
    "https://identity.example.test#configuration",
  ])("rejects an issuer query string or fragment", (issuerUrl) => {
    vi.stubEnv("OIDC_ISSUER_URL", issuerUrl);

    expect(() => getOidcConfiguration()).toThrow(
      "OIDC_ISSUER_URL must not contain a query string or fragment",
    );
  });

  it.each([
    "https://dashboard.example.test/login/callback",
    "https://dashboard.example.test/auth/callback?tenant=cascade",
    "https://dashboard.example.test/auth/callback#complete",
  ])("requires the exact dashboard callback path", (redirectUri) => {
    vi.stubEnv("OIDC_REDIRECT_URI", redirectUri);

    expect(() => getOidcConfiguration()).toThrow(
      "OIDC_REDIRECT_URI must point exactly to /auth/callback",
    );
  });

  it("accepts HTTPS provider and callback URLs in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(getOidcConfiguration()).toEqual(VALID_CONFIGURATION);
  });

  it.each([
    ["OIDC_ISSUER_URL", "http://identity.example.test"],
    ["OIDC_REDIRECT_URI", "http://dashboard.example.test/auth/callback"],
  ])("requires HTTPS for %s in production", (name, value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(name, value);

    expect(() => getOidcConfiguration()).toThrow(`${name} must use https in production`);
  });

  it.each([
    ["OIDC_ISSUER_URL", "https://localhost"],
    ["OIDC_REDIRECT_URI", "https://127.0.0.1/auth/callback"],
  ])("rejects a loopback %s in production", (name, value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(name, value);

    expect(() => getOidcConfiguration()).toThrow(
      `${name} must not use a loopback host in production`,
    );
  });
});
