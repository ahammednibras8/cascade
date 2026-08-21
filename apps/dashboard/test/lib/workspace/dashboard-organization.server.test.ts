import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  organizationMember: {
    findMany: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const originalSecret = process.env["DASHBOARD_SESSION_SECRET"];

process.env["NODE_ENV"] = "test";
process.env["DASHBOARD_SESSION_SECRET"] = "test-dashboard-session-secret-that-is-long-enough";

const { commitActiveDashboardOrganization, getDashboardOrganizationContext } =
  await import("../../../app/lib/workspace/dashboard-organization.server.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("dashboard organization context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DASHBOARD_SESSION_SECRET"] = "test-dashboard-session-secret-that-is-long-enough";

    prisma.organizationMember.findMany.mockResolvedValue([
      {
        role: "OWNER",
        organization: {
          id: "organization-1",
          slug: "alpha",
          name: "Alpha",
        },
      },
      {
        role: "DEVELOPER",
        organization: {
          id: "organization-2",
          slug: "beta",
          name: "Beta",
        },
      },
    ]);
  });

  afterEach(() => {
    process.env["DASHBOARD_SESSION_SECRET"] = originalSecret;
  });

  it("uses the signed selected organization when the user belongs to it", async () => {
    const cookie = await commitActiveDashboardOrganization("organization-2");

    const context = await getDashboardOrganizationContext(
      new Request("http://dashboard.test/", {
        headers: {
          Cookie: cookie,
        },
      }),
      USER_ID,
    );

    expect(context.activeOrganization).toEqual({
      id: "organization-2",
      slug: "beta",
      name: "Beta",
      role: "DEVELOPER",
    });
  });

  it("falls back to the first membership when the selected organization is unavailable", async () => {
    const cookie = await commitActiveDashboardOrganization("organization-unknown");

    const context = await getDashboardOrganizationContext(
      new Request("http://dashboard.test/", {
        headers: {
          Cookie: cookie,
        },
      }),
      USER_ID,
    );

    expect(context.activeOrganization).toEqual({
      id: "organization-1",
      slug: "alpha",
      name: "Alpha",
      role: "OWNER",
    });
  });
});
