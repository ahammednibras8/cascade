import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() =>
  vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { action, loader } = await import("../../app/routes/edit-schedule.js");

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
  });

  it("loads a single schedule", async () => {
    cascadeApiRequest.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    await expect(
      loader({
        params: {
          scheduleId: SCHEDULE_ID,
        },
      } as never),
    ).resolves.toEqual({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    expect(cascadeApiRequest).toHaveBeenCalledWith(`/api/schedules/${SCHEDULE_ID}`);
  });

  it("updates an interval schedule", async () => {
    cascadeApiRequest.mockResolvedValue({
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

    expect(cascadeApiRequest).toHaveBeenCalledWith(`/api/schedules/${SCHEDULE_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scheduleType: "INTERVAL",
        name: "Every two minutes",
        intervalSeconds: 120,
      }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/schedules");
  });

  it("updates a cron schedule and payload", async () => {
    cascadeApiRequest.mockResolvedValue({
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

    expect(cascadeApiRequest).toHaveBeenCalledWith(`/api/schedules/${SCHEDULE_ID}`, {
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
    });
  });

  it("clears the payload", async () => {
    cascadeApiRequest.mockResolvedValue({
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

    expect(cascadeApiRequest).toHaveBeenCalledWith(
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
  });
});
