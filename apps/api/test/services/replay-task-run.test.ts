import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type RunStatus = "PENDING" | "EXECUTING" | "COMPLETED" | "FAILED" | "CANCELED";

type SourceRun = {
  id: string;
  taskId: string;
  deploymentId: string | null;
  status: RunStatus;
  payload: unknown;
  executionConfig: unknown;
};

type ReplayedRun = {
  id: string;
  taskId: string;
  deploymentId: string | null;
  status: "PENDING";
  payload: unknown;
  createdAt: Date;
};

type TransactionClient = {
  taskRun: {
    create: (args: unknown) => Promise<ReplayedRun>;
  };
  taskEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<ReplayedRun>;

const SOURCE_RUN_ID = "22222222-2222-4222-8222-222222222222";
const REPLAYED_RUN_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
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

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  taskRun: {
    findFirst: vi.fn<(args: unknown) => Promise<SourceRun | null>>(),
  },
  $transaction: vi.fn<(callback: TransactionCallback) => Promise<ReplayedRun>>(),
}));

const txTaskRunCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<ReplayedRun>>());

const txTaskEventCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const enqueueTaskRun = vi.hoisted(() => vi.fn<(message: unknown) => Promise<void>>());

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma,
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

const { replayTaskRun } = await import("../../src/services/replay-task-run.js");

function createSourceRun(overrides: Partial<SourceRun> = {}): SourceRun {
  return {
    id: SOURCE_RUN_ID,
    taskId: TASK_ID,
    deploymentId: "deployment-1",
    status: "FAILED",
    payload: {
      message: "hello",
    },
    executionConfig: EXECUTION_CONFIG,
    ...overrides,
  };
}

function createReplayedRun(overrides: Partial<ReplayedRun> = {}): ReplayedRun {
  return {
    id: REPLAYED_RUN_ID,
    taskId: TASK_ID,
    deploymentId: "deployment-1",
    status: "PENDING",
    payload: {
      message: "hello",
    },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("replayTaskRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    txTaskRunCreate.mockResolvedValue(createReplayedRun());
    txTaskEventCreate.mockResolvedValue({});
    enqueueTaskRun.mockResolvedValue(undefined);

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        taskRun: {
          create: txTaskRunCreate,
        },
        taskEvent: {
          create: txTaskEventCreate,
        },
      }),
    );
  });

  it("rejects invalid run ids", async () => {
    const result = await replayTaskRun({
      auth,
      runId: "not-a-uuid",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_RUN_ID",
        message: "runId must be a valid UUID",
      },
    });

    expect(prisma.taskRun.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("rejects runs outside the authenticated environment", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(null);

    const result = await replayTaskRun({
      auth,
      runId: SOURCE_RUN_ID,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Task run was not found in this environment",
      },
    });

    expect(prisma.taskRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: SOURCE_RUN_ID,
          task: {
            environmentId: auth.environmentId,
          },
        },
      }),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("rejects pending runs", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createSourceRun({
        status: "PENDING",
      }),
    );

    const result = await replayTaskRun({
      auth,
      runId: SOURCE_RUN_ID,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "RUN_NOT_REPLAYABLE",
        message: "Cannot replay a run with status PENDING",
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("rejects legacy runs without execution config snapshots", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createSourceRun({
        executionConfig: null,
      }),
    );

    const result = await replayTaskRun({
      auth,
      runId: SOURCE_RUN_ID,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "RUN_EXECUTION_CONFIG_MISSING",
        message: "This legacy run has no execution configuration snapshot and cannot be replayed",
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("creates a new pending run from a failed source run and enqueues it", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createSourceRun({
        status: "FAILED",
      }),
    );

    const result = await replayTaskRun({
      auth,
      runId: SOURCE_RUN_ID,
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      taskRun: {
        id: REPLAYED_RUN_ID,
        taskId: TASK_ID,
        status: "PENDING",
        payload: {
          message: "hello",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        replayedFromRunId: SOURCE_RUN_ID,
      },
    });

    expect(txTaskRunCreate).toHaveBeenCalledWith({
      data: {
        taskId: TASK_ID,
        deploymentId: "deployment-1",
        status: "PENDING",
        executionConfig: EXECUTION_CONFIG,
        payload: {
          message: "hello",
        },
      },
      select: {
        id: true,
        taskId: true,
        deploymentId: true,
        status: true,
        payload: true,
        createdAt: true,
      },
    });

    expect(txTaskEventCreate).toHaveBeenNthCalledWith(1, {
      data: {
        taskRunId: REPLAYED_RUN_ID,
        type: "task.run.replayed",
        level: "INFO",
        message: "Task run manually replayed",
        data: {
          apiKeyId: auth.apiKeyId,
          sourceRunId: SOURCE_RUN_ID,
          sourceStatus: "FAILED",
        },
      },
    });

    expect(txTaskEventCreate).toHaveBeenNthCalledWith(2, {
      data: {
        taskRunId: SOURCE_RUN_ID,
        type: "task.run.replay.created",
        level: "INFO",
        message: "Manual replay created a new task run",
        data: {
          apiKeyId: auth.apiKeyId,
          replayedRunId: REPLAYED_RUN_ID,
        },
      },
    });

    expect(enqueueTaskRun).toHaveBeenCalledWith({
      runId: REPLAYED_RUN_ID,
      taskId: TASK_ID,
      environmentId: auth.environmentId,
      deploymentId: "deployment-1",
    });
  });

  it("can replay completed runs", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createSourceRun({
        status: "COMPLETED",
      }),
    );

    const result = await replayTaskRun({
      auth,
      runId: SOURCE_RUN_ID,
    });

    expect(result.ok).toBe(true);
    expect(enqueueTaskRun).toHaveBeenCalledOnce();
  });

  it("can replay canceled runs", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createSourceRun({
        status: "CANCELED",
      }),
    );

    const result = await replayTaskRun({
      auth,
      runId: SOURCE_RUN_ID,
    });

    expect(result.ok).toBe(true);
    expect(enqueueTaskRun).toHaveBeenCalledOnce();
  });
});
