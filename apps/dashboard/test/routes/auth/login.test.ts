import { beforeEach, describe, expect, it, vi } from "vitest";

const startOidcLogin = vi.hoisted(() =>
  vi.fn<
    (returnTo: string | null) => Promise<{
      authorizationUrl: string;
      setCookie: string;
    }>
  >(),
);

const findOrCreateDevDashboardUser = vi.hoisted(() =>
  vi.fn<() => Promise<{ id: string; email: string; displayName: string }>>(),
);

const createDashboardSession = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<{ token: string; expiresAt: Date }>>(),
);

const commitDashboardSession = vi.hoisted(() => vi.fn<(token: string) => Promise<string>>());
const resolvePostAuthenticationRedirect = vi.hoisted(() =>
  vi.fn<(userId: string, returnTo: string | null) => Promise<string>>(),
);

vi.mock("../../../app/lib/auth/oidc.server.js", () => ({
  startOidcLogin,
}));

vi.mock("../../../app/lib/auth/dashboard-user.server.js", () => ({
  findOrCreateDevDashboardUser,
}));

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  commitDashboardSession,
  createDashboardSession,
}));

vi.mock("../../../app/lib/auth/post-authentication.server.js", () => ({
  resolvePostAuthenticationRedirect,
}));

const { loader } = await import("../../../app/routes/auth/login.js");

describe("auth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DASHBOARD_AUTH_MODE"];
    resolvePostAuthenticationRedirect.mockResolvedValue("/runs");
  });

  it("starts OIDC login and preserves the internal return path", async () => {
    startOidcLogin.mockResolvedValue({
      authorizationUrl: "https://identity.example.test/authorize",
      setCookie: "cascade-oidc=signed-transaction; HttpOnly",
    });

    const response = await loader({
      request: new Request("http://dashboard.test/auth/start?returnTo=/runs"),
    } as never);

    expect(startOidcLogin).toHaveBeenCalledWith("/runs");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://identity.example.test/authorize");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-oidc=");
  });

  it("creates a local dashboard session when dev auth is enabled", async () => {
    process.env["DASHBOARD_AUTH_MODE"] = "dev";
    findOrCreateDevDashboardUser.mockResolvedValue({
      id: "user-1",
      email: "local-dashboard@example.test",
      displayName: "Local Dashboard User",
    });
    createDashboardSession.mockResolvedValue({
      token: "dev-session-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    commitDashboardSession.mockResolvedValue("cascade-session=signed; HttpOnly");

    const response = await loader({
      request: new Request("http://dashboard.test/auth/start?returnTo=/runs"),
    } as never);

    expect(startOidcLogin).not.toHaveBeenCalled();
    expect(findOrCreateDevDashboardUser).toHaveBeenCalledWith();
    expect(createDashboardSession).toHaveBeenCalledWith("user-1");
    expect(commitDashboardSession).toHaveBeenCalledWith("dev-session-token");
    expect(resolvePostAuthenticationRedirect).toHaveBeenCalledWith("user-1", "/runs");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/runs");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-session=");
  });

  it("does not redirect dev auth to an external return URL", async () => {
    process.env["DASHBOARD_AUTH_MODE"] = "dev";
    resolvePostAuthenticationRedirect.mockResolvedValue("/dashboard");
    findOrCreateDevDashboardUser.mockResolvedValue({
      id: "user-1",
      email: "local-dashboard@example.test",
      displayName: "Local Dashboard User",
    });
    createDashboardSession.mockResolvedValue({
      token: "dev-session-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    commitDashboardSession.mockResolvedValue("cascade-session=signed; HttpOnly");

    const response = await loader({
      request: new Request(
        "http://dashboard.test/auth/start?returnTo=https://attacker.example.test",
      ),
    } as never);

    expect(response.headers.get("Location")).toBe("/dashboard");
  });
});
