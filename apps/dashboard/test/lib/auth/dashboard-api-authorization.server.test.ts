import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyDashboardApiAuthorization } from "@cascade/core/dashboard-api-auth";

const getDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());

const getDashboardWorkspaceContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  getDashboardSession,
}));

vi.mock("../../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  getDashboardWorkspaceContext,
}));

const { createDashboardApiAuthorizationForRequest } =
  await import("../../../app/lib/auth/dashboard-api-authorization.server.js");

const SECRET = "test-dashboard-api-auth-secret-that-is-definitely-long-enough";

describe("dashboard API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env["DASHBOARD_API_AUTH_SECRET"] = SECRET;

    getDashboardSession.mockResolvedValue({
      id: "session-1",
      userId: "11111111-1111-4111-8111-111111111111",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    getDashboardWorkspaceContext.mockResolvedValue({
      activeOrganization: {
        id: "22222222-2222-4222-8222-222222222222",
      },
      activeProject: {
        id: "33333333-3333-4333-8333-333333333333",
      },
      activeEnvironment: {
        id: "44444444-4444-4444-8444-444444444444",
      },
    });
  });

  it("creates a signed API token for the session and active workspace", async () => {
    const request = new Request("http://dashboard.test/tasks");

    const token = await createDashboardApiAuthorizationForRequest(request);
    const claims = verifyDashboardApiAuthorization(token, SECRET);

    expect(claims).toMatchObject({
      userId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      projectId: "33333333-3333-4333-8333-333333333333",
      environmentId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("fails when no active environment exists", async () => {
    getDashboardWorkspaceContext.mockResolvedValue({
      activeOrganization: {
        id: "organization-1",
      },
      activeProject: {
        id: "project-1",
      },
      activeEnvironment: null,
    });

    await expect(
      createDashboardApiAuthorizationForRequest(new Request("http://dashboard.test/tasks")),
    ).rejects.toThrow("An active organization, project, and environment are required");
  });
});
