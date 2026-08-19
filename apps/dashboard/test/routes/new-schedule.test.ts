import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("~/lib/cascade-api.server", () => ({
  cascadeDashboardApiRequest,
}));

const { action, loader } = await import("../../app/routes/new-schedule.js");

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function createRequest(fields: Record<string, string>) {
  return new Request("http://dashboard.test/schedules/new", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
}

describe("new schedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads available tasks", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      tasks: [
        {
          id: TASK_ID,
          slug: "hello",
          name: "Hello",
        },
      ],
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/schedules/new") } as never),
    ).resolves.toEqual({
      tasks: [
        {
          id: TASK_ID,
          slug: "hello",
          name: "Hello",
        },
      ],
    });

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(expect.any(Request), "/api/tasks");
  });

  it("creates an interval schedule through the API", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      schedule: {
        id: "schedule-1",
      },
    });

    const response = await action({
      request: createRequest({
        taskId: TASK_ID,
        name: "Every two minutes",
        scheduleType: "INTERVAL",
        intervalSeconds: "120",
        payloadJson: '{"customerId":"customer-1"}',
      }),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/tasks/${TASK_ID}/schedules`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: undefined,
          scheduleType: "INTERVAL",
          name: "Every two minutes",
          intervalSeconds: 120,
          payload: {
            customerId: "customer-1",
          },
        }),
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/schedules");
  });

  it("creates a cron schedule through the API", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      schedule: {
        id: "schedule-1",
      },
    });

    await action({
      request: createRequest({
        taskId: TASK_ID,
        scheduleType: "CRON",
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        payloadJson: "",
      }),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/tasks/${TASK_ID}/schedules`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: undefined,
          scheduleType: "CRON",
          cronExpression: "0 9 * * 1-5",
          timezone: "Asia/Kolkata",
        }),
      },
    );
  });

  it("rejects invalid payload JSON before calling the API", async () => {
    const response = await action({
      request: createRequest({
        taskId: TASK_ID,
        scheduleType: "INTERVAL",
        intervalSeconds: "60",
        payloadJson: "{broken",
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_PAYLOAD_JSON",
        message: "Payload must be valid JSON",
      },
    });

    expect(cascadeDashboardApiRequest).not.toHaveBeenCalled();
  });
});
