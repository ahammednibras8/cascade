import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDashboardUser = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());

const getDashboardWorkspaceContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);

const commitActiveDashboardEnvironment = vi.hoisted(() =>
  vi.fn<(environmentId: string) => Promise<string>>(),
);

vi.mock("../../app/lib/dashboard-auth.server.js", () => ({
  requireDashboardUser,
}));

vi.mock("../../app/lib/dashboard-workspace.server.js", () => ({
  getDashboardWorkspaceContext,
  commitActiveDashboardEnvironment,
}));

const { action } = await import("../../app/routes/select-workspace.js");

describe("workspace selector action", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireDashboardUser.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    getDashboardWorkspaceContext.mockResolvedValue({
      projects: [
        {
          id: "project-1",
          environments: [
            {
              id: "environment-1",
              slug: "dev",
              name: "Development",
              type: "DEVELOPMENT",
            },
          ],
        },
      ],
    });

    commitActiveDashboardEnvironment.mockResolvedValue(
      "cascade-active-environment=signed-value; HttpOnly",
    );
  });

  it("accepts an environment from the active organization", async () => {
    const response = await action({
      request: new Request("http://dashboard.test/workspace/select", {
        method: "POST",
        body: new URLSearchParams([
          ["environmentId", "environment-1"],
          ["returnTo", "/runs"],
        ]),
      }),
    } as never);

    expect(commitActiveDashboardEnvironment).toHaveBeenCalledWith("environment-1");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/runs");
  });

  it("rejects an environment outside the active organization", async () => {
    await expect(
      action({
        request: new Request("http://dashboard.test/workspace/select", {
          method: "POST",
          body: new URLSearchParams([["environmentId", "environment-unknown"]]),
        }),
      } as never),
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});
