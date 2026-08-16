import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ENVIRONMENT_ID = "environment-1";
const DB_NULL = vi.hoisted(() => Symbol("DbNull"));

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const mocks = vi.hoisted(() => ({
  prisma: {
    taskSchedule: {
      findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
      updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
    },
  },
  maybeStoreJsonValue: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: DB_NULL,
  },
  prisma: mocks.prisma,
}));

vi.mock("@cascade/storage", () => ({
  maybeStoreJsonValue: mocks.maybeStoreJsonValue,
}));

const { updateTaskSchedule } =
  await import("../../../src/features/schedules/update-task-schedule.js");

function existingSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    taskId: TASK_ID,
    name: "Old schedule",
    enabled: true,
    revision: 4,
    payload: {
      old: true,
    },
    ...overrides,
  };
}

describe("updateTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    mocks.prisma.taskSchedule.findFirst.mockResolvedValue(existingSchedule());
    mocks.prisma.taskSchedule.updateMany.mockResolvedValue({
      count: 1,
    });
    mocks.maybeStoreJsonValue.mockImplementation(async (value) => value);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates an interval schedule and preserves omitted fields", async () => {
    await expect(
      updateTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
        body: {
          intervalSeconds: 120,
        },
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      schedule: {
        id: SCHEDULE_ID,
        name: "Old schedule",
        scheduleType: "INTERVAL",
        intervalSeconds: 120,
        cronExpression: null,
        timezone: "UTC",
        nextRunAt: "2026-01-01T00:02:00.000Z",
        enabled: true,
        hasPayload: true,
        revision: 5,
      },
    });

    expect(mocks.prisma.taskSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: SCHEDULE_ID,
        revision: 4,
        task: {
          environmentId: ENVIRONMENT_ID,
        },
      },
      data: {
        scheduleType: "INTERVAL",
        intervalSeconds: 120,
        cronExpression: null,
        timezone: "UTC",
        nextRunAt: new Date("2026-01-01T00:02:00.000Z"),
        lockedAt: null,
        revision: {
          increment: 1,
        },
      },
    });
  });

  it("updates a schedule to cron and stores a replacement payload", async () => {
    await expect(
      updateTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
        body: {
          name: " Weekday morning ",
          scheduleType: "CRON",
          cronExpression: "0 9 * * 1-5",
          timezone: "Asia/Kolkata",
          startAt: "2026-01-05T03:29:59.000Z",
          payload: {
            customerId: "customer-1",
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 200,
      schedule: {
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        nextRunAt: "2026-01-05T03:30:00.000Z",
        hasPayload: true,
      },
    });

    expect(mocks.maybeStoreJsonValue).toHaveBeenCalledWith({
      kind: "PAYLOAD",
      environmentId: ENVIRONMENT_ID,
      taskId: TASK_ID,
      runId: SCHEDULE_ID,
      value: {
        customerId: "customer-1",
      },
    });
  });

  it("clears payload when payload is null", async () => {
    await updateTaskSchedule({
      auth,
      scheduleId: SCHEDULE_ID,
      body: {
        intervalSeconds: 60,
        payload: null,
      },
    });

    expect(mocks.prisma.taskSchedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: DB_NULL,
        }),
      }),
    );
  });

  it("returns 409 when the schedule revision changed", async () => {
    mocks.prisma.taskSchedule.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      updateTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
        body: {
          intervalSeconds: 60,
        },
      }),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: {
        code: "SCHEDULE_STATE_CONFLICT",
        message: "Schedule changed before it could be updated; retry the request",
      },
    });
  });

  it("returns 404 for schedules outside the environment", async () => {
    mocks.prisma.taskSchedule.findFirst.mockResolvedValue(null);

    await expect(
      updateTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
        body: {
          intervalSeconds: 60,
        },
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
});
