import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() =>
  vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { action, loader } = await import("../../app/routes/schedules.js");

function actionRequest(input: Record<string, string>) {
  return new Request("http://dashboard.test/schedules", {
    method: "POST",
    body: new URLSearchParams(input),
  });
}

const SCHEDULE_ID = "schedule-1";

describe("schedules loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns schedules from the Cascade API", async () => {
    cascadeApiRequest.mockResolvedValue({
      schedules: [
        {
          id: "schedule-1",
          taskId: "task-1",
          name: "Weekday morning",
          scheduleType: "CRON",
          intervalSeconds: null,
          cronExpression: "0 9 * * 1-5",
          timezone: "Asia/Kolkata",
          nextRunAt: "2026-01-05T03:30:00.000Z",
          lastRunAt: null,
          enabled: true,
          hasPayload: true,
          revision: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          task: {
            id: "task-1",
            slug: "hello",
            name: "Hello",
            deployment: {
              id: "deployment-1",
              version: "v1",
              status: "ACTIVE",
            },
          },
        },
      ],
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/schedules") } as never),
    ).resolves.toEqual({
      schedules: [
        expect.objectContaining({
          id: "schedule-1",
          scheduleType: "CRON",
          task: expect.objectContaining({
            slug: "hello",
          }),
        }),
      ],
    });

    expect(cascadeApiRequest).toHaveBeenCalledWith("/api/schedules");
  });

  it("returns an empty list when the API has no schedules", async () => {
    cascadeApiRequest.mockResolvedValue({
      schedules: [],
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/schedules") } as never),
    ).resolves.toEqual({
      schedules: [],
    });
  });

  it("calls the API pause endpoint", async () => {
    cascadeApiRequest.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    await expect(
      action({
        request: actionRequest({
          intent: "pause",
          scheduleId: SCHEDULE_ID,
        }),
        params: {},
        context: {},
      } as never),
    ).resolves.toEqual({
      ok: true,
      intent: "pause",
      scheduleId: SCHEDULE_ID,
    });

    expect(cascadeApiRequest).toHaveBeenCalledWith(`/api/schedules/${SCHEDULE_ID}/pause`, {
      method: "POST",
    });
  });

  it("calls the API resume endpoint", async () => {
    cascadeApiRequest.mockResolvedValue({
      schedule: {
        id: SCHEDULE_ID,
      },
    });

    await action({
      request: actionRequest({
        intent: "resume",
        scheduleId: SCHEDULE_ID,
      }),
      params: {},
      context: {},
    } as never);

    expect(cascadeApiRequest).toHaveBeenCalledWith(`/api/schedules/${SCHEDULE_ID}/resume`, {
      method: "POST",
    });
  });

  it("calls the API delete endpoint", async () => {
    cascadeApiRequest.mockResolvedValue(null);

    await action({
      request: actionRequest({
        intent: "delete",
        scheduleId: SCHEDULE_ID,
      }),
      params: {},
      context: {},
    } as never);

    expect(cascadeApiRequest).toHaveBeenCalledWith(`/api/schedules/${SCHEDULE_ID}`, {
      method: "DELETE",
    });
  });

  it("rejects invalid dashboard schedule actions", async () => {
    await expect(
      action({
        request: actionRequest({
          intent: "unknown",
          scheduleId: SCHEDULE_ID,
        }),
        params: {},
        context: {},
      } as never),
    ).rejects.toMatchObject({
      status: 400,
    });

    expect(cascadeApiRequest).not.toHaveBeenCalled();
  });
});
