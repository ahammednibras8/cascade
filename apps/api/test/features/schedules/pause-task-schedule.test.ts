import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

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
    updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { pauseTaskSchedule } =
  await import("../../../src/features/schedules/pause-task-schedule.js");

describe("pauseTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pauses an enabled schedule and invalidates old worker claims", async () => {
    prisma.taskSchedule.updateMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      pauseTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      schedule: {
        id: SCHEDULE_ID,
        enabled: false,
        alreadyPaused: false,
      },
    });

    expect(prisma.taskSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: SCHEDULE_ID,
        enabled: true,
        task: {
          environmentId: ENVIRONMENT_ID,
        },
      },
      data: {
        enabled: false,
        lockedAt: null,
        revision: {
          increment: 1,
        },
      },
    });

    expect(prisma.taskSchedule.findFirst).not.toHaveBeenCalled();
  });

  it("is idempotent when the schedule is already paused", async () => {
    prisma.taskSchedule.updateMany.mockResolvedValue({
      count: 0,
    });
    prisma.taskSchedule.findFirst.mockResolvedValue({
      id: SCHEDULE_ID,
      enabled: false,
    });

    await expect(
      pauseTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      schedule: {
        id: SCHEDULE_ID,
        enabled: false,
        alreadyPaused: true,
      },
    });
  });

  it("does not expose schedules from another environment", async () => {
    prisma.taskSchedule.updateMany.mockResolvedValue({
      count: 0,
    });
    prisma.taskSchedule.findFirst.mockResolvedValue(null);

    await expect(
      pauseTaskSchedule({
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
      pauseTaskSchedule({
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

    expect(prisma.taskSchedule.updateMany).not.toHaveBeenCalled();
    expect(prisma.taskSchedule.findFirst).not.toHaveBeenCalled();
  });
});
