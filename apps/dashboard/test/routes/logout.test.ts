import { beforeEach, describe, expect, it, vi } from "vitest";

const destroyDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<string>>());

vi.mock("../../app/lib/dashboard-session.server.js", () => ({
  destroyDashboardSession,
}));

const { action } = await import("../../app/routes/logout.js");

describe("logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the session and redirects to the signed-out page", async () => {
    destroyDashboardSession.mockResolvedValue("cascade-session=; Max-Age=0; HttpOnly");

    const request = new Request("http://dashboard.test/logout", {
      method: "POST",
    });

    const response = await action({ request } as never);

    expect(destroyDashboardSession).toHaveBeenCalledWith(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/signed-out");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
