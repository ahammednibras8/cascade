import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  project: {
    findMany: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

const getDashboardOrganizationContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);

vi.mock("@cascade/database", () => ({
  prisma,
}));

vi.mock("../../app/lib/dashboard-organization.server.js", () => ({
  getDashboardOrganizationContext,
}));

const originalSecret = process.env.DASHBOARD_SESSION_SECRET;

process.env.NODE_ENV = "test";
process.env.DASHBOARD_SESSION_SECRET = "test-dashboard-session-secret-that-is-long-enough";

const { commitActiveDashboardEnvironment, getDashboardWorkspaceContext } =
  await import("../../app/lib/dashboard-workspace.server.js");

describe("dashboard workspace context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_SESSION_SECRET = "test-dashboard-session-secret-that-is-long-enough";

    getDashboardOrganizationContext.mockResolvedValue({
      organizations: [],
      activeOrganization: {
        id: "organization-1",
        slug: "alpha",
        name: "Alpha",
        role: "OWNER",
      },
    });

    prisma.project.findMany.mockResolvedValue([
      {
        id: "project-1",
        slug: "alpha-project",
        name: "Alpha Project",
        environments: [
          {
            id: "environment-1",
            slug: "dev",
            name: "Development",
            type: "DEVELOPMENT",
          },
          {
            id: "environment-2",
            slug: "production",
            name: "Production",
            type: "PRODUCTION",
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.DASHBOARD_SESSION_SECRET;
    } else {
      process.env.DASHBOARD_SESSION_SECRET = originalSecret;
    }
  });

  it("uses the signed selected environment and derives its project", async () => {
    const cookie = await commitActiveDashboardEnvironment("environment-2");

    const context = await getDashboardWorkspaceContext(
      new Request("http://dashboard.test/", {
        headers: {
          Cookie: cookie,
        },
      }),
      "user-1",
    );

    expect(context.activeProject).toMatchObject({
      id: "project-1",
      name: "Alpha Project",
    });

    expect(context.activeEnvironment).toEqual({
      id: "environment-2",
      slug: "production",
      name: "Production",
      type: "PRODUCTION",
    });
  });

  it("queries projects only inside the active organization", async () => {
    await getDashboardWorkspaceContext(new Request("http://dashboard.test/"), "user-1");

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "organization-1",
      },
      select: {
        id: true,
        slug: true,
        name: true,
        environments: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
          },
          orderBy: {
            name: "asc",
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  });
});
