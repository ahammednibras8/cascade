import { beforeEach, describe, expect, it, vi } from "vitest";

type ScheduleType = "INTERVAL" | "CRON";

type DueSchedule = {
  id: string;
  revision: number;
  taskId: string;
  payload: unknown;
  scheduleType: ScheduleType;
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: Date;
  task: {
    environmentId: string;
    deploymentId: string | null;
    executionConfig: unknown;
  };
};

type CreatedRun = { id: string; taskId: string; delayUntil: Date | null };

type TransactionClient = {
  taskSchedule: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
  taskRun: {
    create: (args: unknown) => Promise<CreatedRun>;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;

const NOW = new Date("2026-01-01T00:00:00.000Z");
const NEXT_RUN_AT = new Date("2026-01-01T00:00:00.000Z");
const NEXT_INTERVAL_RUN_AT = new Date("2026-01-01T00:01:00.000Z");
const NEXT_CRON_RUN_AT = new Date("2026-01-01T00:05:00.000Z");
const STALE_LOCK_CUTOFF = new Date("2025-12-31T23:59:30.000Z");
const SCHEDULE_ID = "schedule-1";
const RUN_ID = "run-1";
const TASK_ID = "task-1";
const ENVIRONMENT_ID = "environment-1";
const DEPLOYMENT_ID = "deployment-1";
const PAYLOAD = { message: "scheduled hello" };
const EXECUTION_CONFIG = {
  schemaVersion: 1,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    exponentialBackoff: true,
  },
  queue: {
    name: "hello",
    concurrencyLimit: 2,
  },
};

const mocks = vi.hoisted(() => ({
  prisma: {
    taskSchedule: {
      findMany: vi.fn<(args: unknown) => Promise<DueSchedule[]>>(),
    },
    $transaction: vi.fn<(callback: TransactionCallback) => Promise<unknown>>(),
  },
  txTaskScheduleUpdateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  txTaskScheduleUpdate: vi.fn<(args: unknown) => Promise<unknown>>(),
  txTaskRunCreate: vi.fn<(args: unknown) => Promise<CreatedRun>>(),
  createTaskRunEvent: vi.fn<(tx: unknown, data: unknown) => Promise<{ id: string }>>(),
  enqueueTaskRun: vi.fn<(message: unknown, options?: unknown) => Promise<void>>(),
}));

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma: mocks.prisma,
  createTaskRunEvent: mocks.createTaskRunEvent,
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  enqueueTaskRun: mocks.enqueueTaskRun,
}));

const { sweepDueTaskSchedules } = await import("../../src/scheduler/task-schedules.js");

function createSchedule(overrides: Partial<DueSchedule> = {}): DueSchedule {
  return {
    id: SCHEDULE_ID,
    revision: 1,
    taskId: TASK_ID,
    payload: PAYLOAD,
    scheduleType: "INTERVAL",
    intervalSeconds: 60,
    cronExpression: null,
    timezone: "UTC",
    nextRunAt: NEXT_RUN_AT,
    task: {
      environmentId: ENVIRONMENT_ID,
      deploymentId: DEPLOYMENT_ID,
      executionConfig: EXECUTION_CONFIG,
    },
    ...overrides,
  };
}

async function sweepOne(schedule = createSchedule()) {
  mocks.prisma.taskSchedule.findMany.mockResolvedValue([schedule]);
  return sweepDueTaskSchedules(NOW);
}

function expectScheduleDisabled() {
  expect(mocks.txTaskScheduleUpdate).toHaveBeenCalledWith({
    where: { id: SCHEDULE_ID },
    data: { enabled: false, lockedAt: null },
  });
  expect(mocks.txTaskRunCreate).not.toHaveBeenCalled();
  expect(mocks.enqueueTaskRun).not.toHaveBeenCalled();
}

function expectScheduleAdvanced(nextRunAt: Date) {
  expect(mocks.txTaskScheduleUpdate).toHaveBeenCalledWith({
    where: { id: SCHEDULE_ID },
    data: { lastRunAt: NOW, nextRunAt, lockedAt: null },
  });
}

function expectTriggeredEvent(rule: {
  scheduleType: ScheduleType;
  intervalSeconds: number | null;
  cronExpression: string | null;
}) {
  expect(mocks.createTaskRunEvent).toHaveBeenCalledWith(expect.anything(), {
    taskRunId: RUN_ID,
    type: "task.schedule.triggered",
    level: "INFO",
    message: "Scheduled task run created",
    data: {
      scheduleId: SCHEDULE_ID,
      scheduleRevision: 1,
      scheduledFor: NEXT_RUN_AT.toISOString(),
      timezone: "UTC",
      ...rule,
    },
  });
}

describe("sweepDueTaskSchedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.txTaskScheduleUpdateMany.mockResolvedValue({ count: 1 });
    mocks.txTaskRunCreate.mockResolvedValue({
      id: RUN_ID,
      taskId: TASK_ID,
      delayUntil: NEXT_RUN_AT,
    });
    mocks.createTaskRunEvent.mockResolvedValue({
      id: "event-1",
    });
    mocks.txTaskScheduleUpdate.mockResolvedValue({});
    mocks.enqueueTaskRun.mockResolvedValue(undefined);
    mocks.prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        taskSchedule: {
          updateMany: mocks.txTaskScheduleUpdateMany,
          update: mocks.txTaskScheduleUpdate,
        },
        taskRun: {
          create: mocks.txTaskRunCreate,
        },
      }),
    );
  });

  it("creates task runs for due interval schedules and advances nextRunAt", async () => {
    await expect(sweepOne()).resolves.toBe(1);

    expect(mocks.prisma.taskSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          nextRunAt: { lte: NOW },
        }),
        orderBy: { nextRunAt: "asc" },
        take: 50,
      }),
    );
    expect(mocks.txTaskScheduleUpdateMany).toHaveBeenCalledWith({
      where: {
        id: SCHEDULE_ID,
        revision: 1,
        enabled: true,
        nextRunAt: NEXT_RUN_AT,
        OR: [{ lockedAt: null }, { lockedAt: { lt: STALE_LOCK_CUTOFF } }],
      },
      data: { lockedAt: NOW },
    });
    expect(mocks.txTaskRunCreate).toHaveBeenCalledWith({
      data: {
        taskId: TASK_ID,
        environmentId: ENVIRONMENT_ID,
        deploymentId: DEPLOYMENT_ID,
        scheduleId: SCHEDULE_ID,
        scheduledFor: NEXT_RUN_AT,
        status: "PENDING",
        delayUntil: NEXT_RUN_AT,
        executionConfig: EXECUTION_CONFIG,
        payload: PAYLOAD,
      },
      select: {
        id: true,
        taskId: true,
        delayUntil: true,
      },
    });
    expectTriggeredEvent({
      scheduleType: "INTERVAL",
      intervalSeconds: 60,
      cronExpression: null,
    });
    expectScheduleAdvanced(NEXT_INTERVAL_RUN_AT);
    expect(mocks.enqueueTaskRun).toHaveBeenCalledWith(
      {
        runId: RUN_ID,
        taskId: TASK_ID,
        environmentId: ENVIRONMENT_ID,
        deploymentId: DEPLOYMENT_ID,
      },
      { delayMs: 0 },
    );
  });

  it("does not create or enqueue a run when schedule claim fails", async () => {
    mocks.txTaskScheduleUpdateMany.mockResolvedValue({ count: 0 });

    await expect(sweepOne()).resolves.toBe(1);

    expect(mocks.txTaskRunCreate).not.toHaveBeenCalled();
    expect(mocks.createTaskRunEvent).not.toHaveBeenCalled();
    expect(mocks.txTaskScheduleUpdate).not.toHaveBeenCalled();
    expect(mocks.enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("disables a due schedule when its task has no execution config", async () => {
    await sweepOne(
      createSchedule({
        task: {
          ...createSchedule().task,
          executionConfig: null,
        },
      }),
    );

    expect(mocks.txTaskScheduleUpdate).toHaveBeenCalledOnce();
    expectScheduleDisabled();
  });

  it("creates a run and advances a cron schedule in its timezone", async () => {
    await sweepOne(
      createSchedule({
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "*/5 * * * *",
      }),
    );

    expect(mocks.createTaskRunEvent).toHaveBeenCalledOnce();
    expectTriggeredEvent({
      scheduleType: "CRON",
      intervalSeconds: null,
      cronExpression: "*/5 * * * *",
    });
    expectScheduleAdvanced(NEXT_CRON_RUN_AT);
  });

  it("disables a cron schedule with an invalid expression", async () => {
    await sweepOne(
      createSchedule({
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "not a cron expression",
      }),
    );

    expect(mocks.txTaskScheduleUpdate).toHaveBeenCalledOnce();
    expectScheduleDisabled();
  });
});
