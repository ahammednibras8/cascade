import { beforeEach, describe, expect, it, vi } from "vitest";

type DueSchedule = {
  id: string;
  taskId: string;
  payload: unknown;
  intervalSeconds: number;
  nextRunAt: Date;
  task: {
    environmentId: string;
    deploymentId: string | null;
  };
};

type CreatedRun = {
  id: string;
  taskId: string;
  delayUntil: Date | null;
};

type TransactionClient = {
  taskSchedule: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
  taskRun: {
    create: (args: unknown) => Promise<CreatedRun>;
  };
  taskEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;

const NOW = new Date("2026-01-01T00:00:00.000Z");
const NEXT_RUN_AT = new Date("2026-01-01T00:00:00.000Z");
const SCHEDULE_ID = "schedule-1";
const RUN_ID = "run-1";
const TASK_ID = "task-1";
const ENVIRONMENT_ID = "environment-1";
const DEPLOYMENT_ID = "deployment-1";

const prisma = vi.hoisted(() => ({
  taskSchedule: {
    findMany: vi.fn<(args: unknown) => Promise<DueSchedule[]>>(),
  },
  $transaction: vi.fn<(callback: TransactionCallback) => Promise<unknown>>(),
}));

const txTaskScheduleUpdateMany = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ count: number }>>(),
);

const txTaskScheduleUpdate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const txTaskRunCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<CreatedRun>>());

const txTaskEventCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const enqueueTaskRun = vi.hoisted(() =>
  vi.fn<(message: unknown, options?: unknown) => Promise<void>>(),
);

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma,
}));

vi.mock("../queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

const { sweepDueTaskSchedules } = await import("../scheduler/task-schedules.js");

function createSchedule(): DueSchedule {
  return {
    id: SCHEDULE_ID,
    taskId: TASK_ID,
    payload: {
      message: "scheduled hello",
    },
    intervalSeconds: 60,
    nextRunAt: NEXT_RUN_AT,
    task: {
      environmentId: ENVIRONMENT_ID,
      deploymentId: DEPLOYMENT_ID,
    },
  };
}

describe("sweepDueTaskSchedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    txTaskScheduleUpdateMany.mockResolvedValue({
      count: 1,
    });

    txTaskRunCreate.mockResolvedValue({
      id: RUN_ID,
      taskId: TASK_ID,
      delayUntil: NEXT_RUN_AT,
    });

    txTaskEventCreate.mockResolvedValue({});
    txTaskScheduleUpdate.mockResolvedValue({});
    enqueueTaskRun.mockResolvedValue(undefined);

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        taskSchedule: {
          updateMany: txTaskScheduleUpdateMany,
          update: txTaskScheduleUpdate,
        },
        taskRun: {
          create: txTaskRunCreate,
        },
        taskEvent: {
          create: txTaskEventCreate,
        },
      }),
    );
  });

  it("creates task runs for due schedules and advances nextRunAt", async () => {
    prisma.taskSchedule.findMany.mockResolvedValue([createSchedule()]);

    const count = await sweepDueTaskSchedules(NOW);

    expect(count).toBe(1);

    expect(prisma.taskSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          nextRunAt: {
            lte: NOW,
          },
        }),
        orderBy: {
          nextRunAt: "asc",
        },
        take: 50,
      }),
    );

    expect(txTaskScheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SCHEDULE_ID,
          enabled: true,
          nextRunAt: {
            lte: NOW,
          },
        }),
        data: {
          lockedAt: NOW,
        },
      }),
    );

    expect(txTaskRunCreate).toHaveBeenCalledWith({
      data: {
        taskId: TASK_ID,
        deploymentId: DEPLOYMENT_ID,
        scheduleId: SCHEDULE_ID,
        status: "PENDING",
        delayUntil: NEXT_RUN_AT,
        payload: {
          message: "scheduled hello",
        },
      },
      select: {
        id: true,
        taskId: true,
        delayUntil: true,
      },
    });

    expect(txTaskEventCreate).toHaveBeenCalledWith({
      data: {
        taskRunId: RUN_ID,
        type: "task.schedule.triggered",
        level: "INFO",
        message: "Scheduled task run created",
        data: {
          scheduleId: SCHEDULE_ID,
          scheduledFor: "2026-01-01T00:00:00.000Z",
          intervalSeconds: 60,
        },
      },
    });

    expect(txTaskScheduleUpdate).toHaveBeenCalledWith({
      where: {
        id: SCHEDULE_ID,
      },
      data: {
        lastRunAt: NOW,
        nextRunAt: new Date("2026-01-01T00:01:00.000Z"),
        lockedAt: null,
      },
    });

    expect(enqueueTaskRun).toHaveBeenCalledWith(
      {
        runId: RUN_ID,
        taskId: TASK_ID,
        environmentId: ENVIRONMENT_ID,
        deploymentId: DEPLOYMENT_ID,
      },
      {
        delayMs: 0,
      },
    );
  });

  it("does not create or enqueue a run when schedule claim fails", async () => {
    prisma.taskSchedule.findMany.mockResolvedValue([createSchedule()]);

    txTaskScheduleUpdateMany.mockResolvedValue({
      count: 0,
    });

    const count = await sweepDueTaskSchedules(NOW);

    expect(count).toBe(1);
    expect(txTaskRunCreate).not.toHaveBeenCalled();
    expect(txTaskEventCreate).not.toHaveBeenCalled();
    expect(txTaskScheduleUpdate).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });
});
