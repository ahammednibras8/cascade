import { beforeEach, describe, expect, it, vi } from "vitest";

const RUN_ID = "run-1";
const TASK_ID = "task-1";
const ENVIRONMENT_ID = "environment-1";
const DEPLOYMENT_ID = "deployment-1";
const NOW = new Date("2026-01-01T00:01:00.000Z");

type PendingRun = {
  id: string;
  taskId: string;
  deploymentId: string | null;
  task: {
    environmentId: string;
  };
};

type TransactionClient = {
  taskRun: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

type TransactionCallback<T> = (tx: TransactionClient) => Promise<T>;

const prisma = vi.hoisted(() => ({
  taskRun: {
    findMany: vi.fn<(args: unknown) => Promise<PendingRun[]>>(),
  },
  $transaction: vi.fn<<T>(callback: TransactionCallback<T>) => Promise<T>>(),
}));

const txTaskRunUpdateMany = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ count: number }>>(),
);

const createTaskRunEvent = vi.hoisted(() =>
  vi.fn<(tx: unknown, data: unknown) => Promise<{ id: string }>>(),
);

const enqueueTaskRun = vi.hoisted(() =>
  vi.fn<(message: unknown, options?: unknown) => Promise<void>>(),
);

vi.mock("@cascade/database", () => ({
  prisma,
  createTaskRunEvent,
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

const { sweepPendingTaskRuns } = await import("../../src/sweeper/pending-runs.js");

function createPendingRun(): PendingRun {
  return {
    id: RUN_ID,
    taskId: TASK_ID,
    deploymentId: DEPLOYMENT_ID,
    task: {
      environmentId: ENVIRONMENT_ID,
    },
  };
}

function mockTransactionClient() {
  prisma.$transaction.mockImplementation(async (callback) =>
    callback({
      taskRun: {
        updateMany: txTaskRunUpdateMany,
      },
    }),
  );
}

describe("sweepPendingTaskRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTransactionClient();

    txTaskRunUpdateMany.mockResolvedValue({
      count: 1,
    });

    createTaskRunEvent.mockResolvedValue({
      id: "event-1",
    });
    enqueueTaskRun.mockResolvedValue(undefined);
  });

  it("re-enqueues stale pending task runs and records a recovery event", async () => {
    prisma.taskRun.findMany.mockResolvedValue([createPendingRun()]);

    const sweptCount = await sweepPendingTaskRuns(NOW);

    expect(sweptCount).toBe(1);

    expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PENDING",
          updatedAt: {
            lt: new Date("2026-01-01T00:00:30.000Z"),
          },
          OR: [
            {
              delayUntil: null,
            },
            {
              delayUntil: {
                lte: NOW,
              },
            },
          ],
        },
        orderBy: {
          updatedAt: "asc",
        },
        take: 50,
      }),
    );

    expect(txTaskRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: RUN_ID,
          status: "PENDING",
          updatedAt: {
            lt: new Date("2026-01-01T00:00:30.000Z"),
          },
        }),
        data: {
          updatedAt: NOW,
        },
      }),
    );

    expect(createTaskRunEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskRunId: RUN_ID,
        type: "task.run.requeued",
        level: "WARN",
        message: "Pending task run was re-enqueued by recovery sweeper",
        data: {
          reason: "PENDING_RUN_RECOVERY",
          recoveryAfterMs: 30_000,
        },
      }),
    );

    expect(enqueueTaskRun).toHaveBeenCalledWith({
      runId: RUN_ID,
      taskId: TASK_ID,
      environmentId: ENVIRONMENT_ID,
      deploymentId: DEPLOYMENT_ID,
    });
  });

  it("does not enqueue when another worker already claimed the pending run", async () => {
    prisma.taskRun.findMany.mockResolvedValue([createPendingRun()]);

    txTaskRunUpdateMany.mockResolvedValue({
      count: 0,
    });

    const sweptCount = await sweepPendingTaskRuns(NOW);

    expect(sweptCount).toBe(1);
    expect(createTaskRunEvent).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });
});
