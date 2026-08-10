import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";
const ENVIRONMENT_ID = "environment-1";

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  taskSchedule: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { getTaskSchedule } = await import("../../src/services/get-task-schedule.js");

describe("getTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a schedule and its payload from the authenticated environment", async () => {
    prisma.taskSchedule.findFirst.mockResolvedValue({
      id: SCHEDULE_ID,
      taskId: "task-1",
      name: "Weekday morning",
      scheduleType: "CRON",
      intervalSeconds: null,
      cronExpression: "0 9 * * 1-5",
      timezone: "Asia/Kolkata",
      nextRunAt: new Date("2026-01-05T03:30:00.000Z"),
      lastRunAt: null,
      enabled: true,
      payload: {
        customerId: "customer-1",
      },
      revision: 3,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      task: {
        id: "task-1",
        slug: "hello",
        name: "Hello",
      },
    });

    await expect(
      getTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      schedule: {
        id: SCHEDULE_ID,
        taskId: "task-1",
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        nextRunAt: "2026-01-05T03:30:00.000Z",
        lastRunAt: null,
        enabled: true,
        payload: {
          customerId: "customer-1",
        },
        revision: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        task: {
          id: "task-1",
          slug: "hello",
          name: "Hello",
        },
      },
    });

    expect(prisma.taskSchedule.findFirst).toHaveBeenCalledWith({
      where: {
        id: SCHEDULE_ID,
        task: {
          environmentId: ENVIRONMENT_ID,
        },
      },
      select: expect.objectContaining({
        payload: true,
        task: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      }),
    });
  });

  it("does not expose schedules from another environment", async () => {
    prisma.taskSchedule.findFirst.mockResolvedValue(null);

    await expect(
      getTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: {
        code: "SCHEDULE_NOT_FOUND",
        message: "Schedule was not found in this environment",
      },
    });
  });

  it("rejects invalid schedule IDs before querying the database", async () => {
    await expect(
      getTaskSchedule({
        auth,
        scheduleId: "not-a-uuid",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_SCHEDULE_ID",
        message: "scheduleId must be a valid UUID",
      },
    });

    expect(prisma.taskSchedule.findFirst).not.toHaveBeenCalled();
  });
});
