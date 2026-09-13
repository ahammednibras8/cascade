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

describe("dashboard sessions", () => {
  it("cleans expired sessions and stores only the new token HMAC hash", async () => {
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
    expect(prisma.dashboardSession.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            expiresAt: {
              lte: expect.any(Date),
            },
          },
        ],
      },
    });
  });

  it("revokes the presented session before creating its replacement", async () => {
    const previousToken = "previous-dashboard-session-token";
    const cookie = await commitDashboardSession({
      token: previousToken,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
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
        OR: [
          {
            expiresAt: {
              lte: expect.any(Date),
            },
          },
          {
            tokenHash: hashDashboardSessionToken(previousToken),
          },
        ],
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
});

describe("dashboard session cookie security", () => {
  it("uses the database session expiration for the browser cookie", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");

    const cookie = await commitDashboardSession({
      token: "dashboard-session-token",
      expiresAt,
    });

    expect(cookie).toContain(`Expires=${expiresAt.toUTCString()}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("uses a secure host-only cookie in production", async () => {
    process.env["NODE_ENV"] = "production";

    const cookie = await commitDashboardSession({
      token: "production-dashboard-session-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    expect(cookie).toContain("__Host-cascade-session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });
});

describe("dashboard session validation and revocation", () => {
  it("reads a valid unexpired session from a signed cookie", async () => {
    const token = "valid-dashboard-session-token";
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");

    prisma.dashboardSession.findUnique.mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      expiresAt,
    });

    const cookie = await commitDashboardSession({ token, expiresAt });
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

    const cookie = await commitDashboardSession({
      token,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
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
    const cookie = await commitDashboardSession({
      token,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

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
