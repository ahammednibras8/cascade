import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>());

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { loader } = await import("../../app/routes/schedules.js");

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

    await expect(loader()).resolves.toEqual({
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

    await expect(loader()).resolves.toEqual({
      schedules: [],
    });
  });
});
