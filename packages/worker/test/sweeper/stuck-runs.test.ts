import { beforeEach, describe, expect, it, vi } from "vitest";

const RUN_ID = "run-1";
const TASK_ID = "task-1";
const ATTEMPT_ID = "attempt-1";
const ENVIRONMENT_ID = "environment-1";
const DEPLOYMENT_ID = "deployment-1";
const NOW = new Date("2026-01-01T00:01:00.000Z");
const LAST_HEARTBEAT_AT = new Date("2026-01-01T00:00:00.000Z");

type TransactionClient = {
  taskRun: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  taskAttempt: {
    update: (args: unknown) => Promise<unknown>;
  };
  taskEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback<T> = (tx: TransactionClient) => Promise<T>;

const prisma = vi.hoisted(() => ({
  taskRun: {
    findMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  },
  $transaction: vi.fn<<T>(callback: TransactionCallback<T>) => Promise<T>>(),
}));

const txTaskRunUpdateMany = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ count: number }>>(),
);

const txTaskAttemptUpdate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const txTaskEventCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const taskRegistryGet = vi.hoisted(() => vi.fn<(taskSlug: string) => unknown>());

const enqueueTaskRun = vi.hoisted(() =>
  vi.fn<(message: unknown, options: unknown) => Promise<void>>(),
);

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: "DB_NULL",
  },
  prisma,
}));

vi.mock("../../src/tasks/registry.js", () => ({
  taskRegistry: {
    get: taskRegistryGet,
  },
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

const { sweepStuckTaskRuns } = await import("../../src/sweeper/stuck-runs.js");

function createStuckRun(attemptNumber = 1) {
  return {
    id: RUN_ID,
    taskId: TASK_ID,
    deploymentId: DEPLOYMENT_ID,
    lastHeartbeatAt: LAST_HEARTBEAT_AT,
    task: {
      slug: "hello",
      environmentId: ENVIRONMENT_ID,
    },
    attempts: [
      {
        id: ATTEMPT_ID,
        attemptNumber,
      },
    ],
  };
}

function mockTransactionClient() {
  prisma.$transaction.mockImplementation(async (callback) =>
    callback({
      taskRun: {
        updateMany: txTaskRunUpdateMany,
      },
      taskAttempt: {
        update: txTaskAttemptUpdate,
      },
      taskEvent: {
        create: txTaskEventCreate,
      },
    }),
  );
}

describe("sweepStuckTaskRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTransactionClient();

    txTaskRunUpdateMany.mockResolvedValue({
      count: 1,
    });

    txTaskAttemptUpdate.mockResolvedValue({});
    txTaskEventCreate.mockResolvedValue({});
    enqueueTaskRun.mockResolvedValue(undefined);
  });

  it("marks a stuck executing run failed when no retry attempts remain", async () => {
    prisma.taskRun.findMany.mockResolvedValue([createStuckRun(1)]);

    taskRegistryGet.mockReturnValue({
      id: "hello",
      retry: {
        maxAttempts: 1,
        delayMs: 1000,
        exponentialBackoff: true,
      },
    });

    const sweptCount = await sweepStuckTaskRuns(NOW);

    expect(sweptCount).toBe(1);

    expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "EXECUTING",
          OR: [
            {
              lastHeartbeatAt: null,
            },
            {
              lastHeartbeatAt: {
                lt: new Date("2026-01-01T00:00:30.000Z"),
              },
            },
          ],
        },
      }),
    );

    expect(txTaskRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: RUN_ID,
          status: "EXECUTING",
        }),
        data: expect.objectContaining({
          status: "FAILED",
          output: "DB_NULL",
          error: expect.objectContaining({
            code: "STUCK_RUN",
            message: "Task run stopped heartbeating while executing",
            lastHeartbeatAt: LAST_HEARTBEAT_AT.toISOString(),
            timeoutMs: 30_000,
          }),
          lastHeartbeatAt: NOW,
          completedAt: NOW,
        }),
      }),
    );

    expect(txTaskAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ATTEMPT_ID,
        },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.objectContaining({
            code: "STUCK_RUN",
          }),
          completedAt: NOW,
        }),
      }),
    );

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.failed",
          level: "ERROR",
          message: "Task run stopped heartbeating and was marked failed",
          data: expect.objectContaining({
            reason: "STUCK_RUN",
            attemptNumber: 1,
            nextAttemptNumber: null,
            maxAttempts: 1,
            delayMs: 0,
          }),
        }),
      }),
    );

    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("marks a stuck executing run pending and enqueues a retry when attempts remain", async () => {
    prisma.taskRun.findMany.mockResolvedValue([createStuckRun(2)]);

    taskRegistryGet.mockReturnValue({
      id: "hello",
      retry: {
        maxAttempts: 3,
        delayMs: 1000,
        exponentialBackoff: true,
      },
    });

    const sweptCount = await sweepStuckTaskRuns(NOW);

    expect(sweptCount).toBe(1);

    expect(txTaskRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: RUN_ID,
          status: "EXECUTING",
        }),
        data: expect.objectContaining({
          status: "PENDING",
          output: "DB_NULL",
          error: expect.objectContaining({
            code: "STUCK_RUN",
          }),
          lastHeartbeatAt: null,
          completedAt: null,
        }),
      }),
    );

    expect(txTaskAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ATTEMPT_ID,
        },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.objectContaining({
            code: "STUCK_RUN",
          }),
          completedAt: NOW,
        }),
      }),
    );

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.retry.scheduled",
          level: "WARN",
          message: "Task run stopped heartbeating and retry was scheduled",
          data: expect.objectContaining({
            reason: "STUCK_RUN",
            attemptNumber: 2,
            nextAttemptNumber: 3,
            maxAttempts: 3,
            delayMs: 2000,
          }),
        }),
      }),
    );

    expect(enqueueTaskRun).toHaveBeenCalledWith(
      {
        runId: RUN_ID,
        taskId: TASK_ID,
        environmentId: ENVIRONMENT_ID,
        deploymentId: DEPLOYMENT_ID,
      },
      {
        delayMs: 2000,
      },
    );
  });
});
