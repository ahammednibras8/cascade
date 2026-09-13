import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn<(callback: (transaction: unknown) => Promise<unknown>) => Promise<unknown>>(),
  dashboardSession: {
    create: vi.fn<(input: unknown) => Promise<unknown>>(),
    findUnique: vi.fn<(input: unknown) => Promise<unknown>>(),
    deleteMany: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const originalSessionSecret = process.env["DASHBOARD_SESSION_SECRET"];
const originalNodeEnv = process.env["NODE_ENV"];
const testSessionSecret = "test-dashboard-session-secret-that-is-long-enough";

process.env["DASHBOARD_SESSION_SECRET"] = testSessionSecret;
process.env["NODE_ENV"] = "test";

const {
  commitDashboardSession,
  destroyDashboardSession,
  getDashboardSession,
  hashDashboardSessionToken,
  rotateDashboardSession,
} = await import("../../../app/lib/auth/dashboard-session.server.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

describe("dashboard sessions", () => {
  beforeEach(() => {
    process.env["DASHBOARD_SESSION_SECRET"] = testSessionSecret;
    process.env["NODE_ENV"] = "test";
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  });

  afterEach(() => {
    process.env["DASHBOARD_SESSION_SECRET"] = originalSessionSecret;
    process.env["NODE_ENV"] = originalNodeEnv;
  });

  it("rotates to a random token but stores only its HMAC hash", async () => {
    prisma.dashboardSession.create.mockResolvedValue({});

    const session = await rotateDashboardSession(
      new Request("http://dashboard.test/login"),
      USER_ID,
    );

    expect(session.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(session.token.length).toBeGreaterThanOrEqual(43);

    expect(prisma.dashboardSession.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        tokenHash: hashDashboardSessionToken(session.token),
        expiresAt: expect.any(Date),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.dashboardSession.deleteMany).not.toHaveBeenCalled();
  });

  it("revokes the presented session before creating its replacement", async () => {
    const previousToken = "previous-dashboard-session-token";
    const cookie = await commitDashboardSession(previousToken);
    prisma.dashboardSession.deleteMany.mockResolvedValue({ count: 1 });
    prisma.dashboardSession.create.mockResolvedValue({});

    const session = await rotateDashboardSession(
      new Request("http://dashboard.test/auth/callback", {
        headers: {
          Cookie: cookie,
        },
      }),
      USER_ID,
    );

    expect(prisma.dashboardSession.deleteMany).toHaveBeenCalledWith({
      where: {
        tokenHash: hashDashboardSessionToken(previousToken),
      },
    });
    expect(prisma.dashboardSession.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        tokenHash: hashDashboardSessionToken(session.token),
        expiresAt: session.expiresAt,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.dashboardSession.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.dashboardSession.create.mock.invocationCallOrder[0] ?? 0,
    );
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
