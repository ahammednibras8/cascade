import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  dashboardSession: {
    create: vi.fn<(input: unknown) => Promise<unknown>>(),
    findUnique: vi.fn<(input: unknown) => Promise<unknown>>(),
    deleteMany: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const originalSessionSecret = process.env.DASHBOARD_SESSION_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testSessionSecret = "test-dashboard-session-secret-that-is-long-enough";

process.env.DASHBOARD_SESSION_SECRET = testSessionSecret;
process.env.NODE_ENV = "test";

const {
  commitDashboardSession,
  createDashboardSession,
  destroyDashboardSession,
  getDashboardSession,
  hashDashboardSessionToken,
} = await import("../../../app/lib/auth/dashboard-session.server.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

describe("dashboard sessions", () => {
  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = testSessionSecret;
    process.env.NODE_ENV = "test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = originalSessionSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("creates a random token but stores only its HMAC hash", async () => {
    prisma.dashboardSession.create.mockResolvedValue({});

    const session = await createDashboardSession(USER_ID);

    expect(session.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(session.token.length).toBeGreaterThanOrEqual(43);

    expect(prisma.dashboardSession.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        tokenHash: hashDashboardSessionToken(session.token),
        expiresAt: expect.any(Date),
      },
    });
  });

  it("reads a valid unexpired session from a signed cookie", async () => {
    const token = "valid-dashboard-session-token";
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");

    prisma.dashboardSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      expiresAt,
    });

    const cookie = await commitDashboardSession(token);
    const session = await getDashboardSession(
      new Request("http://dashboard.test/tasks", {
        headers: {
          Cookie: cookie,
        },
      }),
    );

    expect(prisma.dashboardSession.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: hashDashboardSessionToken(token),
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
      },
    });

    expect(session).toEqual({
      id: SESSION_ID,
      userId: USER_ID,
      expiresAt,
    });
  });

  it("deletes an expired session and returns null", async () => {
    const token = "expired-dashboard-session-token";

    prisma.dashboardSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const cookie = await commitDashboardSession(token);
    const session = await getDashboardSession(
      new Request("http://dashboard.test/tasks", {
        headers: {
          Cookie: cookie,
        },
      }),
    );

    expect(session).toBeNull();
    expect(prisma.dashboardSession.deleteMany).toHaveBeenCalledWith({
      where: {
        id: SESSION_ID,
      },
    });
  });

  it("deletes the stored session during logout and expires the browser cookie", async () => {
    const token = "logout-dashboard-session-token";
    const cookie = await commitDashboardSession(token);

    const setCookie = await destroyDashboardSession(
      new Request("http://dashboard.test/logout", {
        headers: {
          Cookie: cookie,
        },
      }),
    );

    expect(prisma.dashboardSession.deleteMany).toHaveBeenCalledWith({
      where: {
        tokenHash: hashDashboardSessionToken(token),
      },
    });
    expect(setCookie).toContain("Max-Age=0");
  });
});
