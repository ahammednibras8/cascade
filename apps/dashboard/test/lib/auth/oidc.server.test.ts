import { beforeEach, describe, expect, it, vi } from "vitest";

const oidc = vi.hoisted(() => ({
  authorizationCodeGrant: vi.fn<(input: unknown, url: URL, checks: unknown) => Promise<unknown>>(),
  buildAuthorizationUrl: vi.fn<(input: unknown, parameters: unknown) => URL>(),
  calculatePKCECodeChallenge: vi.fn<(value: string) => Promise<string>>(),
  discovery: vi.fn<(issuer: URL, clientId: string, clientSecret: string) => Promise<unknown>>(),
  randomNonce: vi.fn<() => string>(),
  randomPKCECodeVerifier: vi.fn<() => string>(),
  randomState: vi.fn<() => string>(),
}));

vi.mock("openid-client", () => oidc);

process.env["NODE_ENV"] = "test";
process.env["DASHBOARD_SESSION_SECRET"] = "test-dashboard-session-secret-that-is-long-enough";
process.env["OIDC_ISSUER_URL"] = "https://identity.example.test";
process.env["OIDC_CLIENT_ID"] = "cascade-dashboard";
process.env["OIDC_CLIENT_SECRET"] = "oidc-client-secret";
process.env["OIDC_REDIRECT_URI"] = "http://dashboard.test/auth/callback";

const { completeOidcLogin, OidcAuthenticationError, startOidcLogin } =
  await import("../../../app/lib/auth/oidc.server.js");

const OIDC_CONFIGURATION = { configuration: true };

async function completeWithClaims(claims: Record<string, unknown> | undefined) {
  const start = await startOidcLogin("/tasks");

  oidc.authorizationCodeGrant.mockResolvedValue({
    claims() {
      return claims;
    },
  });

  return completeOidcLogin(
    new Request("http://dashboard.test/auth/callback?code=authorization-code&state=state-123", {
      headers: {
        Cookie: start.setCookie,
      },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  oidc.discovery.mockResolvedValue(OIDC_CONFIGURATION);
  oidc.randomState.mockReturnValue("state-123");
  oidc.randomNonce.mockReturnValue("nonce-123");
  oidc.randomPKCECodeVerifier.mockReturnValue("verifier-123");
  oidc.calculatePKCECodeChallenge.mockResolvedValue("challenge-123");
  oidc.buildAuthorizationUrl.mockReturnValue(
    new URL("https://identity.example.test/authorize?state=state-123"),
  );
});

describe("OIDC login start", () => {
  it("creates an authorization request with PKCE, state, nonce, and a signed transaction cookie", async () => {
    const result = await startOidcLogin("/runs");

    expect(oidc.discovery).toHaveBeenCalledWith(
      new URL("https://identity.example.test"),
      "cascade-dashboard",
      "oidc-client-secret",
    );

    expect(oidc.buildAuthorizationUrl).toHaveBeenCalledWith(OIDC_CONFIGURATION, {
      redirect_uri: "http://dashboard.test/auth/callback",
      response_type: "code",
      scope: "openid profile email",
      state: "state-123",
      nonce: "nonce-123",
      code_challenge: "challenge-123",
      code_challenge_method: "S256",
    });

    expect(result.authorizationUrl).toBe("https://identity.example.test/authorize?state=state-123");
    expect(result.setCookie).toContain("cascade-oidc=");
    expect(result.setCookie).toContain("HttpOnly");
  });

  it("rejects external return URLs", async () => {
    await startOidcLogin("https://attacker.example.test");

    const result = await startOidcLogin("/");

    expect(result.setCookie).toContain("cascade-oidc=");
  });
});

describe("OIDC login completion", () => {
  it("validates the callback and returns a normalized OIDC profile", async () => {
    const start = await startOidcLogin("/tasks");

    oidc.authorizationCodeGrant.mockResolvedValue({
      claims() {
        return {
          sub: "provider-user-123",
          email: " Nibras@Example.Test ",
          email_verified: true,
          name: " Ahammed Nibras ",
        };
      },
    });

    const result = await completeOidcLogin(
      new Request("http://dashboard.test/auth/callback?code=authorization-code&state=state-123", {
        headers: {
          Cookie: start.setCookie,
        },
      }),
    );

    expect(oidc.authorizationCodeGrant).toHaveBeenCalledWith(
      OIDC_CONFIGURATION,
      new URL("http://dashboard.test/auth/callback?code=authorization-code&state=state-123"),
      {
        pkceCodeVerifier: "verifier-123",
        expectedState: "state-123",
        expectedNonce: "nonce-123",
        idTokenExpected: true,
      },
    );

    expect(result.profile).toEqual({
      provider: "https://identity.example.test",
      subject: "provider-user-123",
      email: "nibras@example.test",
      displayName: "Ahammed Nibras",
    });
    expect(result.returnTo).toBe("/tasks");
    expect(result.clearCookie).toContain("Max-Age=0");
  });

  it.each([
    undefined,
    { email: "nibras@example.test", email_verified: true },
    {
      sub: " ",
      email: "nibras@example.test",
      email_verified: true,
    },
    {
      sub: "s".repeat(256),
      email: "nibras@example.test",
      email_verified: true,
    },
  ])("rejects missing or invalid identity claims", async (claims) => {
    await expect(completeWithClaims(claims)).rejects.toMatchObject({
      name: "OidcAuthenticationError",
      code: "invalid_identity",
    });
  });

  it.each([
    "nibras.example.test",
    "nibras@@example.test",
    "nibras @example.test",
    `${"a".repeat(243)}@example.test`,
  ])("rejects the malformed email claim %s", async (email) => {
    await expect(
      completeWithClaims({
        sub: "provider-user-123",
        email,
        email_verified: true,
      }),
    ).rejects.toMatchObject({
      name: "OidcAuthenticationError",
      code: "invalid_identity",
    });
  });

  it.each([undefined, false, "true"])(
    "requires email_verified to be the boolean value true",
    async (emailVerified) => {
      await expect(
        completeWithClaims({
          sub: "provider-user-123",
          email: "nibras@example.test",
          email_verified: emailVerified,
        }),
      ).rejects.toMatchObject({
        name: "OidcAuthenticationError",
        code: "email_not_verified",
      });
    },
  );

  it.each([42, " ", "n".repeat(201)])("rejects an invalid optional display name", async (name) => {
    await expect(
      completeWithClaims({
        sub: "provider-user-123",
        email: "nibras@example.test",
        email_verified: true,
        name,
      }),
    ).rejects.toMatchObject({
      name: "OidcAuthenticationError",
      code: "invalid_identity",
    });
  });

  it("allows the optional display name to be absent", async () => {
    await expect(
      completeWithClaims({
        sub: "provider-user-123",
        email: "nibras@example.test",
        email_verified: true,
      }),
    ).resolves.toMatchObject({
      profile: {
        displayName: null,
      },
    });
  });

  it("rejects callbacks without a valid OIDC transaction cookie", async () => {
    await expect(
      completeOidcLogin(new Request("http://dashboard.test/auth/callback?code=authorization-code")),
    ).rejects.toBeInstanceOf(OidcAuthenticationError);
  });
});
