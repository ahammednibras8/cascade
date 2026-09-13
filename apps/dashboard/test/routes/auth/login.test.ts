import { beforeEach, describe, expect, it, vi } from "vitest";

const startOidcLogin = vi.hoisted(() =>
  vi.fn<
    (
      returnTo: string | null,
      options?: { selectAccount?: boolean },
    ) => Promise<{
      authorizationUrl: string;
      setCookie: string;
    }>
  >(),
);
const clearOidcLoginTransaction = vi.hoisted(() => vi.fn<() => Promise<string>>());
const getDashboardLoginErrorCode = vi.hoisted(() => vi.fn<(error: unknown) => string>());

const findOrCreateDevDashboardUser = vi.hoisted(() =>
  vi.fn<() => Promise<{ id: string; email: string; displayName: string }>>(),
);

const rotateDashboardSession = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<{ token: string; expiresAt: Date }>>(),
);

const commitDashboardSession = vi.hoisted(() =>
  vi.fn<(session: { token: string; expiresAt: Date }) => Promise<string>>(),
);
const resolvePostAuthenticationRedirect = vi.hoisted(() =>
  vi.fn<(userId: string, returnTo: string | null) => Promise<string>>(),
);

vi.mock("../../../app/lib/auth/oidc.server.js", () => ({
  clearOidcLoginTransaction,
  startOidcLogin,
}));

vi.mock("../../../app/lib/auth/login-error.server.js", () => ({
  getDashboardLoginErrorCode,
}));

vi.mock("../../../app/lib/auth/dashboard-user.server.js", () => ({
  findOrCreateDevDashboardUser,
}));

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  commitDashboardSession,
  rotateDashboardSession,
}));

vi.mock("../../../app/lib/auth/post-authentication.server.js", () => ({
  resolvePostAuthenticationRedirect,
}));

const { loader } = await import("../../../app/routes/auth/login.js");

describe("auth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DASHBOARD_AUTH_MODE"];
    clearOidcLoginTransaction.mockResolvedValue("cascade-oidc=; Max-Age=0");
    getDashboardLoginErrorCode.mockReturnValue("authentication_failed");
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

    expect(startOidcLogin).toHaveBeenCalledWith("/runs", {
      selectAccount: false,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://identity.example.test/authorize");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-oidc=");
  });

  it("requests account selection only for the exact true query value", async () => {
    startOidcLogin.mockResolvedValue({
      authorizationUrl: "https://identity.example.test/authorize",
      setCookie: "cascade-oidc=signed-transaction; HttpOnly",
    });

    await loader({
      request: new Request("http://dashboard.test/auth/start?selectAccount=true"),
    } as never);

    expect(startOidcLogin).toHaveBeenCalledWith("/dashboard", {
      selectAccount: true,
    });

    vi.clearAllMocks();
    startOidcLogin.mockResolvedValue({
      authorizationUrl: "https://identity.example.test/authorize",
      setCookie: "cascade-oidc=signed-transaction; HttpOnly",
    });

    await loader({
      request: new Request("http://dashboard.test/auth/start?selectAccount=login"),
    } as never);

    expect(startOidcLogin).toHaveBeenCalledWith("/dashboard", {
      selectAccount: false,
    });
  });

  it("creates a local dashboard session when dev auth is enabled", async () => {
    process.env["DASHBOARD_AUTH_MODE"] = "dev";
    findOrCreateDevDashboardUser.mockResolvedValue({
      id: "user-1",
      email: "local-dashboard@example.test",
      displayName: "Local Dashboard User",
    });
    rotateDashboardSession.mockResolvedValue({
      token: "dev-session-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    commitDashboardSession.mockResolvedValue("cascade-session=signed; HttpOnly");

    const request = new Request("http://dashboard.test/auth/start?returnTo=/runs");
    const response = await loader({ request } as never);

    expect(startOidcLogin).not.toHaveBeenCalled();
    expect(findOrCreateDevDashboardUser).toHaveBeenCalledWith();
    expect(rotateDashboardSession).toHaveBeenCalledWith(request, "user-1");
    expect(commitDashboardSession).toHaveBeenCalledWith({
      token: "dev-session-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
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
    rotateDashboardSession.mockResolvedValue({
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

  it("rejects an external OIDC return path before starting authentication", async () => {
    startOidcLogin.mockResolvedValue({
      authorizationUrl: "https://identity.example.test/authorize",
      setCookie: "cascade-oidc=signed-transaction; HttpOnly",
    });

    await loader({
      request: new Request(
        "http://dashboard.test/auth/start?returnTo=https://attacker.example.test",
      ),
    } as never);

    expect(startOidcLogin).toHaveBeenCalledWith("/dashboard", {
      selectAccount: false,
    });
  });

  it("returns a safe error when provider discovery fails", async () => {
    const failure = new Error("raw provider failure must not be exposed");
    startOidcLogin.mockRejectedValue(failure);
    getDashboardLoginErrorCode.mockReturnValue("provider_unavailable");

    const response = await loader({
      request: new Request("http://dashboard.test/auth/start?returnTo=/runs"),
    } as never);

    expect(getDashboardLoginErrorCode).toHaveBeenCalledWith(failure);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/login?error=provider_unavailable&returnTo=%2Fruns",
    );
    expect(response.headers.get("Location")).not.toContain("raw");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
