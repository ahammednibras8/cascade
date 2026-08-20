import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDashboardUser = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
const getDashboardOrganizations = vi.hoisted(() => vi.fn<(userId: string) => Promise<unknown>>());
const commitActiveDashboardOrganization = vi.hoisted(() =>
  vi.fn<(organizationId: string) => Promise<string>>(),
);
const clearActiveDashboardEnvironment = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("../../../app/lib/auth/dashboard-auth.server.js", () => ({
  requireDashboardUser,
}));

vi.mock("../../../app/lib/workspace/dashboard-organization.server.js", () => ({
  getDashboardOrganizations,
  commitActiveDashboardOrganization,
}));

vi.mock("../../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  clearActiveDashboardEnvironment,
}));

const { action } = await import("../../../app/routes/workspace/select-organization.js");

describe("organization selector action", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireDashboardUser.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    getDashboardOrganizations.mockResolvedValue([
      {
        id: "organization-1",
        slug: "alpha",
        name: "Alpha",
        role: "OWNER",
      },
    ]);

    commitActiveDashboardOrganization.mockResolvedValue(
      "cascade-active-organization=signed-value; HttpOnly",
    );
    clearActiveDashboardEnvironment.mockResolvedValue(
      "cascade-active-environment=; Max-Age=0; HttpOnly",
    );
  });

  it("accepts a selected organization the user belongs to", async () => {
    const response = await action({
      request: new Request("http://dashboard.test/organizations/select", {
        method: "POST",
        body: new URLSearchParams([
          ["organizationId", "organization-1"],
          ["returnTo", "/runs"],
        ]),
      }),
    } as never);

    expect(commitActiveDashboardOrganization).toHaveBeenCalledWith("organization-1");
    expect(clearActiveDashboardEnvironment).toHaveBeenCalledWith();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/runs");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-active-organization=");
    expect(response.headers.get("Set-Cookie")).toContain("cascade-active-environment=");
  });

  it("rejects selecting an organization the user does not belong to", async () => {
    await expect(
      action({
        request: new Request("http://dashboard.test/organizations/select", {
          method: "POST",
          body: new URLSearchParams([["organizationId", "organization-unknown"]]),
        }),
      } as never),
    ).rejects.toMatchObject({
      status: 403,
    });

    expect(commitActiveDashboardOrganization).not.toHaveBeenCalled();
    expect(clearActiveDashboardEnvironment).not.toHaveBeenCalled();
  });
});
