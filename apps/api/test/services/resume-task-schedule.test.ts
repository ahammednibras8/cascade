import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { resumeTaskSchedule } = await import("../../src/services/resume-task-schedule.js");

function pausedIntervalSchedule() {
  return {
    id: SCHEDULE_ID,
    enabled: false,
    scheduleType: "INTERVAL" as const,
    intervalSeconds: 60,
    cronExpression: null,
    timezone: "UTC",
    nextRunAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("resumeTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resumes an interval schedule with a new future occurrence", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    prisma.taskSchedule.findFirst.mockResolvedValue(pausedIntervalSchedule());
    prisma.taskSchedule.updateMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      resumeTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      schedule: {
        id: SCHEDULE_ID,
        enabled: true,
        alreadyResumed: false,
        nextRunAt: "2026-01-01T00:01:00.000Z",
      },
    });

    expect(prisma.taskSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: SCHEDULE_ID,
        enabled: false,
        task: {
          environmentId: ENVIRONMENT_ID,
        },
      },
      data: {
        enabled: true,
        nextRunAt: new Date("2026-01-01T00:01:00.000Z"),
        lockedAt: null,
        revision: {
          increment: 1,
        },
      },
    });
  });

  it("resumes cron schedules using their stored timezone", async () => {
    vi.setSystemTime(new Date("2026-01-05T03:29:59.000Z"));
    prisma.taskSchedule.findFirst.mockResolvedValue({
      ...pausedIntervalSchedule(),
      scheduleType: "CRON",
      intervalSeconds: null,
      cronExpression: "0 9 * * 1-5",
      timezone: "Asia/Kolkata",
    });
    prisma.taskSchedule.updateMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      resumeTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 200,
      schedule: {
        id: SCHEDULE_ID,
        enabled: true,
        alreadyResumed: false,
        nextRunAt: "2026-01-05T03:30:00.000Z",
      },
    });
  });

  it("is idempotent when the schedule is already enabled", async () => {
    prisma.taskSchedule.findFirst.mockResolvedValue({
      ...pausedIntervalSchedule(),
      enabled: true,
      nextRunAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    await expect(
      resumeTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      schedule: {
        id: SCHEDULE_ID,
        enabled: true,
        alreadyResumed: true,
        nextRunAt: "2026-01-02T00:00:00.000Z",
      },
    });

    expect(prisma.taskSchedule.updateMany).not.toHaveBeenCalled();
  });

  it("rejects malformed stored schedule rules", async () => {
    prisma.taskSchedule.findFirst.mockResolvedValue({
      ...pausedIntervalSchedule(),
      scheduleType: "CRON",
      intervalSeconds: null,
      cronExpression: "not a cron expression",
      timezone: "UTC",
    });

    await expect(
      resumeTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: {
        code: "INVALID_SCHEDULE_RULE",
        message: "Schedule has an invalid rule and cannot be resumed",
      },
    });

    expect(prisma.taskSchedule.updateMany).not.toHaveBeenCalled();
  });

  it("does not expose schedules from another environment", async () => {
    prisma.taskSchedule.findFirst.mockResolvedValue(null);

    await expect(
      resumeTaskSchedule({
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
});
