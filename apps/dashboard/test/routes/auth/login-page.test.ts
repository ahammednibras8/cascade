import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
const createDashboardSession = vi.hoisted(() => vi.fn<(userId: string) => Promise<unknown>>());
const commitDashboardSession = vi.hoisted(() => vi.fn<(token: string) => Promise<string>>());
const findOrCreateDevDashboardUser = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const hasUsableDashboardWorkspace = vi.hoisted(() => vi.fn<(userId: string) => Promise<boolean>>());

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  commitDashboardSession,
  createDashboardSession,
  getDashboardSession,
}));

vi.mock("../../../app/lib/auth/dashboard-user.server.js", () => ({
  findOrCreateDevDashboardUser,
}));

vi.mock("../../../app/lib/auth/post-authentication.server.js", () => ({
  hasUsableDashboardWorkspace,
}));

const { action, loader } = await import("../../../app/routes/auth/login-page.js");
const originalAuthMode = process.env["DASHBOARD_AUTH_MODE"];

describe("login page route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DASHBOARD_AUTH_MODE"];
    getDashboardSession.mockResolvedValue(null);
  });

  afterEach(() => {
    if (originalAuthMode === undefined) {
      delete process.env["DASHBOARD_AUTH_MODE"];
    } else {
      process.env["DASHBOARD_AUTH_MODE"] = originalAuthMode;
    }
  });

  it("preserves an internal return path for the authentication state", async () => {
    const result = await loader({
      request: new Request("http://dashboard.test/login?returnTo=/runs"),
    } as never);

    expect(result).toEqual({
      authenticated: false,
      devAuthEnabled: false,
      error: null,
      returnTo: "/runs",
      stage: "authentication",
    });
  });

  it("rejects an external return path", async () => {
    const result = await loader({
      request: new Request("http://dashboard.test/login?returnTo=https://attacker.example.test"),
    } as never);

    expect(result).toEqual({
      authenticated: false,
      devAuthEnabled: false,
      error: null,
      returnTo: "/dashboard",
      stage: "authentication",
    });
  });

  it("renders workspace state for an authenticated user without a workspace", async () => {
    getDashboardSession.mockResolvedValue({ userId: "user-1" });
    hasUsableDashboardWorkspace.mockResolvedValue(false);

    const result = await loader({
      request: new Request("http://dashboard.test/login"),
    } as never);

    expect(result).toEqual({
      authenticated: true,
      devAuthEnabled: false,
      error: null,
      returnTo: "/dashboard",
      stage: "workspace",
    });
    expect(hasUsableDashboardWorkspace).toHaveBeenCalledWith("user-1");
  });

  it("redirects an authenticated user with a workspace into the product", async () => {
    getDashboardSession.mockResolvedValue({ userId: "user-1" });
    hasUsableDashboardWorkspace.mockResolvedValue(true);

    const response = await loader({
      request: new Request("http://dashboard.test/login?returnTo=/runs"),
    } as never).catch((error: unknown) => error);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/runs");
  });

  it("creates a development session without navigating away from login", async () => {
    process.env["DASHBOARD_AUTH_MODE"] = "dev";
    findOrCreateDevDashboardUser.mockResolvedValue({ id: "user-1" });
    createDashboardSession.mockResolvedValue({ token: "session-token" });
    commitDashboardSession.mockResolvedValue("cascade-session=signed; HttpOnly");

    const response = await action({
      request: new Request("http://dashboard.test/login", {
        method: "POST",
        body: new URLSearchParams({ intent: "authenticate" }),
      }),
    } as never);

    expect(response).toBeInstanceOf(Response);
    await expect((response as Response).json()).resolves.toEqual({
      ok: true,
      stage: "workspace",
    });
    expect((response as Response).headers.get("Set-Cookie")).toContain("cascade-session=");
    expect(findOrCreateDevDashboardUser).toHaveBeenCalledWith();
    expect(createDashboardSession).toHaveBeenCalledWith("user-1");
  });
});
