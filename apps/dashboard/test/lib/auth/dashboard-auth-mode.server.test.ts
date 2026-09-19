import { afterEach, describe, expect, it, vi } from "vitest";
import { isDevDashboardAuthEnabled } from "../../../app/lib/auth/dashboard-auth-mode.server.js";

describe("dashboard auth mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses OIDC when no auth mode is configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DASHBOARD_AUTH_MODE", "");

    expect(isDevDashboardAuthEnabled()).toBe(false);
  });

  it("allows dev auth outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DASHBOARD_AUTH_MODE", "dev");

    expect(isDevDashboardAuthEnabled()).toBe(true);
  });

  it("rejects an unknown auth mode", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DASHBOARD_AUTH_MODE", "password");

    expect(() => isDevDashboardAuthEnabled()).toThrow("DASHBOARD_AUTH_MODE must be dev or oidc");
  });

  it("rejects dev auth in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_MODE", "dev");

    expect(() => isDevDashboardAuthEnabled()).toThrow(
      "DASHBOARD_AUTH_MODE=dev cannot be used in production",
    );
  });
});
