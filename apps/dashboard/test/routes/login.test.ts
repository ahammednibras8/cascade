import { beforeEach, describe, expect, it, vi } from "vitest";

const startOidcLogin = vi.hoisted(() => vi.fn<(returnTo: string | null) => Promise<unknown>>());

vi.mock("../../app/lib/oidc.server.js", () => ({
  startOidcLogin,
}));

const { loader } = await import("../../app/routes/login.js");

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts OIDC login and preserves the internal return path", async () => {
    startOidcLogin.mockResolvedValue({
      authorizationUrl: "https://identity.example.test/authorize",
      setCookie: "cascade-oidc=signed-transaction; HttpOnly",
    });

    const response = await loader({
      request: new Request("http://dashboard.test/login?returnTo=/runs"),
    } as never);

    expect(startOidcLogin).toHaveBeenCalledWith("/runs");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://identity.example.test/authorize");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-oidc=");
  });
});
