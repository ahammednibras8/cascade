import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

const requireDashboardCapability = vi.hoisted(() =>
  vi.fn<(request: Request, capability: string) => Promise<unknown>>(),
);

vi.mock("~/lib/api/cascade-api.server", () => ({
  cascadeDashboardApiRequest,
}));

vi.mock("~/lib/auth/dashboard-permissions.server", () => ({
  requireDashboardCapability,
}));

const { action, loader } = await import("../../../app/routes/schedules/edit-schedule.js");

const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";

function request(fields: Record<string, string>) {
  return new Request(`http://dashboard.test/schedules/${SCHEDULE_ID}/edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
}

describe("edit schedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDashboardCapability.mockResolvedValue({});
  });

  it("loads a single schedule", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    await expect(
      loader({
        request: new Request(`http://dashboard.test/schedules/${SCHEDULE_ID}/edit`),
        params: {
          scheduleId: SCHEDULE_ID,
        },
      } as never),
    ).resolves.toEqual({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/schedules/${SCHEDULE_ID}`,
    );
  });

  it("updates an interval schedule", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    const response = await action({
      params: {
        scheduleId: SCHEDULE_ID,
      },
      request: request({
        name: "Every two minutes",
        scheduleType: "INTERVAL",
        intervalSeconds: "120",
        payloadJson: "",
      }),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/schedules/${SCHEDULE_ID}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scheduleType: "INTERVAL",
          name: "Every two minutes",
          intervalSeconds: 120,
        }),
      },
    );
    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "SCHEDULES_MANAGE",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/schedules");
  });

  it("updates a cron schedule and payload", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    await action({
      params: {
        scheduleId: SCHEDULE_ID,
      },
      request: request({
        name: "Weekday morning",
        scheduleType: "CRON",
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        payloadJson: '{"customerId":"customer-1"}',
      }),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/schedules/${SCHEDULE_ID}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scheduleType: "CRON",
          name: "Weekday morning",
          cronExpression: "0 9 * * 1-5",
          timezone: "Asia/Kolkata",
          payload: {
            customerId: "customer-1",
          },
        }),
      },
    );
    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "SCHEDULES_MANAGE",
    );
  });

  it("clears the payload", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    await action({
      params: {
        scheduleId: SCHEDULE_ID,
      },
      request: request({
        name: "Every minute",
        scheduleType: "INTERVAL",
        intervalSeconds: "60",
        payloadJson: "",
        clearPayload: "true",
      }),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/schedules/${SCHEDULE_ID}`,
      expect.objectContaining({
        body: JSON.stringify({
          scheduleType: "INTERVAL",
          name: "Every minute",
          intervalSeconds: 60,
          payload: null,
        }),
      }),
    );
    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "SCHEDULES_MANAGE",
    );
  });

  it("does not call the API when schedule management permission is denied", async () => {
    requireDashboardCapability.mockRejectedValueOnce(
      new Response("Forbidden", {
        status: 403,
      }),
    );

    await expect(
      action({
        params: {
          scheduleId: SCHEDULE_ID,
        },
        request: request({
          name: "Every two minutes",
          scheduleType: "INTERVAL",
          intervalSeconds: "120",
          payloadJson: "",
        }),
      } as never),
    ).rejects.toMatchObject({
      status: 403,
    });

    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "SCHEDULES_MANAGE",
    );
    expect(cascadeDashboardApiRequest).not.toHaveBeenCalled();
  });
});
