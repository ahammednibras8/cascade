import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDashboardUser = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());

const getDashboardWorkspaceContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);

vi.mock("../../../app/lib/auth/dashboard-auth.server.js", () => ({
  requireDashboardUser,
}));

vi.mock("../../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  getDashboardWorkspaceContext,
}));

const { requireDashboardCapability } =
  await import("../../../app/lib/auth/dashboard-permissions.server.js");

const request = new Request("http://dashboard.test/runs");

function setRole(role: "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER" | null) {
  getDashboardWorkspaceContext.mockResolvedValue({
    activeOrganization: role
      ? {
          id: "organization-1",
          role,
        }
      : null,
  });
}

describe("requireDashboardCapability", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireDashboardUser.mockResolvedValue({
      userId: "user-1",
    });
  });

  it.each([
    ["OWNER", "RUNS_MUTATE"],
    ["ADMIN", "RUNS_MUTATE"],
    ["DEVELOPER", "RUNS_MUTATE"],
    ["OWNER", "SCHEDULES_MANAGE"],
    ["ADMIN", "SCHEDULES_MANAGE"],
    ["DEVELOPER", "SCHEDULES_MANAGE"],
    ["OWNER", "DEPLOYMENTS_MANAGE"],
    ["ADMIN", "DEPLOYMENTS_MANAGE"],
    ["DEVELOPER", "DEPLOYMENTS_MANAGE"],
    ["OWNER", "API_KEYS_MANAGE"],
    ["ADMIN", "API_KEYS_MANAGE"],
  ] as const)("allows %s to use %s", async (role, capability) => {
    setRole(role);

    await expect(requireDashboardCapability(request, capability)).resolves.toEqual({
      session: {
        userId: "user-1",
      },
      workspace: {
        activeOrganization: {
          id: "organization-1",
          role,
        },
      },
    });
  });

  it.each([
    ["VIEWER", "RUNS_MUTATE"],
    ["VIEWER", "SCHEDULES_MANAGE"],
    ["VIEWER", "DEPLOYMENTS_MANAGE"],
    ["VIEWER", "API_KEYS_MANAGE"],
    ["DEVELOPER", "API_KEYS_MANAGE"],
  ] as const)("rejects %s from using %s", async (role, capability) => {
    setRole(role);

    await expect(requireDashboardCapability(request, capability)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects when no organization is active", async () => {
    setRole(null);

    await expect(requireDashboardCapability(request, "RUNS_MUTATE")).rejects.toMatchObject({
      status: 403,
    });
  });
});
