import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("../../../app/lib/auth/dashboard-auth.server.js");

const getDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  getDashboardSession,
}));

const { requireDashboardUser } = await import("../../../app/lib/auth/dashboard-auth.server.js");

describe("requireDashboardUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the authenticated session", async () => {
    const session = {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };

    getDashboardSession.mockResolvedValue(session);

    await expect(requireDashboardUser(new Request("http://dashboard.test/runs"))).resolves.toEqual(
      session,
    );
  });

  it("redirects an unauthenticated request to login with its return path", async () => {
    getDashboardSession.mockResolvedValue(null);

    let thrown: unknown;

    try {
      await requireDashboardUser(new Request("http://dashboard.test/runs?status=FAILED"));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
  });
});
