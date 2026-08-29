import { beforeEach, describe, expect, it, vi } from "vitest";

const completeOidcLogin = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
const clearOidcLoginTransaction = vi.hoisted(() => vi.fn<() => Promise<string>>());
const findOrCreateOidcUser = vi.hoisted(() => vi.fn<(profile: unknown) => Promise<unknown>>());
const createDashboardSession = vi.hoisted(() => vi.fn<(userId: string) => Promise<unknown>>());
const commitDashboardSession = vi.hoisted(() => vi.fn<(token: string) => Promise<string>>());
const resolvePostAuthenticationRedirect = vi.hoisted(() =>
  vi.fn<(userId: string, returnTo: string) => Promise<string>>(),
);

vi.mock("../../../app/lib/auth/oidc.server.js", () => ({
  completeOidcLogin,
  clearOidcLoginTransaction,
}));

vi.mock("../../../app/lib/auth/dashboard-user.server.js", () => ({
  findOrCreateOidcUser,
}));

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  createDashboardSession,
  commitDashboardSession,
}));

vi.mock("../../../app/lib/auth/post-authentication.server.js", () => ({
  resolvePostAuthenticationRedirect,
}));

const { loader } = await import("../../../app/routes/auth/auth-callback.js");

const profile = {
  provider: "https://identity.example.test",
  subject: "identity-user-123",
  email: "nibras@example.test",
  displayName: "Ahammed Nibras",
};

describe("OIDC callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePostAuthenticationRedirect.mockResolvedValue("/runs");
  });

  it("creates a dashboard session and returns to the requested page", async () => {
    completeOidcLogin.mockResolvedValue({
      profile,
      returnTo: "/runs",
      clearCookie: "cascade-oidc=; Max-Age=0",
    });
    findOrCreateOidcUser.mockResolvedValue({
      id: "user-1",
    });
    createDashboardSession.mockResolvedValue({
      token: "dashboard-session-token",
    });
    commitDashboardSession.mockResolvedValue("cascade-session=signed-session; HttpOnly");

    const response = await loader({
      request: new Request("http://dashboard.test/auth/callback?code=test"),
    } as never);

    expect(findOrCreateOidcUser).toHaveBeenCalledWith(profile);
    expect(createDashboardSession).toHaveBeenCalledWith("user-1");
    expect(commitDashboardSession).toHaveBeenCalledWith("dashboard-session-token");
    expect(resolvePostAuthenticationRedirect).toHaveBeenCalledWith("user-1", "/runs");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/runs");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-oidc=");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-session=");
  });

  it("clears the OIDC transaction and returns to login on failure", async () => {
    completeOidcLogin.mockRejectedValue(new Error("invalid authorization code"));
    clearOidcLoginTransaction.mockResolvedValue("cascade-oidc=; Max-Age=0");

    const response = await loader({
      request: new Request("http://dashboard.test/auth/callback?code=bad"),
    } as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login?error=authentication_failed");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(findOrCreateOidcUser).not.toHaveBeenCalled();
    expect(createDashboardSession).not.toHaveBeenCalled();
    expect(resolvePostAuthenticationRedirect).not.toHaveBeenCalled();
  });
});
