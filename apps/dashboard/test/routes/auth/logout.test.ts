import { beforeEach, describe, expect, it, vi } from "vitest";

const destroyDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<string>>());

const clearActiveDashboardOrganization = vi.hoisted(() => vi.fn<() => Promise<string>>());
const clearActiveDashboardEnvironment = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  destroyDashboardSession,
}));

vi.mock("../../../app/lib/workspace/dashboard-organization.server.js", () => ({
  clearActiveDashboardOrganization,
}));

vi.mock("../../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  clearActiveDashboardEnvironment,
}));

const { action } = await import("../../../app/routes/auth/logout.js");

describe("logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActiveDashboardOrganization.mockResolvedValue(
      "cascade-active-organization=; Max-Age=0; HttpOnly",
    );
    clearActiveDashboardEnvironment.mockResolvedValue(
      "cascade-active-environment=; Max-Age=0; HttpOnly",
    );
  });

  it("deletes the session and redirects to the signed-out page", async () => {
    destroyDashboardSession.mockResolvedValue("cascade-session=; Max-Age=0; HttpOnly");

    const request = new Request("http://dashboard.test/logout", {
      method: "POST",
    });

    const response = await action({ request } as never);

    expect(destroyDashboardSession).toHaveBeenCalledWith(request);
    expect(clearActiveDashboardOrganization).toHaveBeenCalledWith();
    expect(clearActiveDashboardEnvironment).toHaveBeenCalledWith();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/signed-out");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-active-organization=");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-active-environment=");
  });
});
