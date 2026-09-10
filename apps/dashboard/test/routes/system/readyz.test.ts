import { beforeEach, describe, expect, it, vi } from "vitest";

const isDevDashboardAuthEnabled = vi.hoisted(() => vi.fn<() => boolean>());
const getOidcConfiguration = vi.hoisted(() => vi.fn<() => unknown>());

vi.mock("../../../app/lib/auth/dashboard-auth-mode.server.js", () => ({
  isDevDashboardAuthEnabled,
}));

vi.mock("../../../app/lib/auth/oidc-config.server.js", () => ({
  getOidcConfiguration,
}));

const { loader } = await import("../../../app/routes/system/readyz.js");

describe("dashboard readiness route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ready without requiring OIDC configuration in dev mode", async () => {
    isDevDashboardAuthEnabled.mockReturnValue(true);

    const response = loader();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "@cascade/dashboard",
      authMode: "dev",
    });
    expect(getOidcConfiguration).not.toHaveBeenCalled();
  });

  it("validates OIDC configuration before reporting ready in OIDC mode", async () => {
    isDevDashboardAuthEnabled.mockReturnValue(false);
    getOidcConfiguration.mockReturnValue({});

    const response = loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "@cascade/dashboard",
      authMode: "oidc",
    });
    expect(getOidcConfiguration).toHaveBeenCalledOnce();
  });

  it("does not report ready when OIDC configuration is invalid", () => {
    isDevDashboardAuthEnabled.mockReturnValue(false);
    getOidcConfiguration.mockImplementation(() => {
      throw new Error("OIDC_CLIENT_SECRET is required");
    });

    expect(() => loader()).toThrow("OIDC_CLIENT_SECRET is required");
  });
});
