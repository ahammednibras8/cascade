import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type RunStatus = "PENDING" | "EXECUTING" | "COMPLETED" | "FAILED" | "CANCELED";
type AttemptStatus = "EXECUTING" | "COMPLETED" | "FAILED" | "CANCELED";

type DbRun = {
  id: string;
  taskId: string;
  status: RunStatus;
  attempts: Array<{
    id: string;
    status: AttemptStatus;
    attemptNumber: number;
  }>;
};

type TransactionClient = {
  taskRun: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  taskAttempt: {
    update: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  taskRun: {
    findFirst: vi.fn<(args: unknown) => Promise<DbRun | null>>(),
  },
  $transaction: vi.fn<(callback: TransactionCallback) => Promise<unknown>>(),
}));

const txTaskRunUpdateMany = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ count: number }>>(),
);

const txTaskAttemptUpdate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const createTaskRunEvent = vi.hoisted(() =>
  vi.fn<(tx: unknown, data: unknown) => Promise<{ id: string }>>(),
);

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: "DB_NULL",
  },
  prisma,
  createTaskRunEvent,
}));

const { cancelTaskRun } = await import("../../src/services/cancel-task-run.js");

function createRun(overrides: Partial<DbRun> = {}): DbRun {
  return {
    id: RUN_ID,
    taskId: TASK_ID,
    status: "PENDING",
    attempts: [],
    ...overrides,
  };
}

describe("cancelTaskRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    txTaskRunUpdateMany.mockResolvedValue({
      count: 1,
    });

    txTaskAttemptUpdate.mockResolvedValue({});
    createTaskRunEvent.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
    });

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        taskRun: {
          updateMany: txTaskRunUpdateMany,
        },
        taskAttempt: {
          update: txTaskAttemptUpdate,
        },
      }),
    );
  });

  it("rejects invalid run ids", async () => {
    const result = await cancelTaskRun({
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
  });

  it("rejects runs outside the authenticated environment", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(null);

    const result = await cancelTaskRun({
      auth,
      runId: RUN_ID,
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
          id: RUN_ID,
          task: {
            environmentId: auth.environmentId,
          },
        },
      }),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not cancel completed runs", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createRun({
        status: "COMPLETED",
      }),
    );

    const result = await cancelTaskRun({
      auth,
      runId: RUN_ID,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "RUN_NOT_CANCELABLE",
        message: "Cannot cancel a run with status COMPLETED",
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("treats already canceled runs as a successful no-op", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createRun({
        status: "CANCELED",
      }),
    );

    const result = await cancelTaskRun({
      auth,
      runId: RUN_ID,
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      taskRun: {
        id: RUN_ID,
        taskId: TASK_ID,
        status: "CANCELED",
        canceled: true,
        alreadyCanceled: true,
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cancels a pending run and writes a cancel event", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createRun({
        status: "PENDING",
      }),
    );

    const result = await cancelTaskRun({
      auth,
      runId: RUN_ID,
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      taskRun: {
        id: RUN_ID,
        taskId: TASK_ID,
        status: "CANCELED",
        canceled: true,
        alreadyCanceled: false,
      },
    });

    expect(txTaskRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: RUN_ID,
          status: {
            in: ["PENDING", "EXECUTING"],
          },
        },
        data: expect.objectContaining({
          status: "CANCELED",
          output: "DB_NULL",
          error: {
            code: "RUN_CANCELED",
            message: "Task run was canceled",
            apiKeyId: auth.apiKeyId,
            previousStatus: "PENDING",
          },
          lastHeartbeatAt: expect.any(Date),
          completedAt: expect.any(Date),
        }),
      }),
    );

    expect(txTaskAttemptUpdate).not.toHaveBeenCalled();

    expect(createTaskRunEvent).toHaveBeenCalledWith(expect.anything(), {
      taskRunId: RUN_ID,
      type: "task.run.canceled",
      level: "WARN",
      message: "Task run canceled by API request",
      data: {
        apiKeyId: auth.apiKeyId,
        previousStatus: "PENDING",
        attemptNumber: null,
      },
    });
  });

  it("cancels an executing run and its latest executing attempt", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createRun({
        status: "EXECUTING",
        attempts: [
          {
            id: ATTEMPT_ID,
            status: "EXECUTING",
            attemptNumber: 2,
          },
        ],
      }),
    );

    const result = await cancelTaskRun({
      auth,
      runId: RUN_ID,
    });

    expect(result.ok).toBe(true);

    expect(txTaskAttemptUpdate).toHaveBeenCalledWith({
      where: {
        id: ATTEMPT_ID,
      },
      data: expect.objectContaining({
        status: "CANCELED",
        error: {
          code: "RUN_CANCELED",
          message: "Task run was canceled",
          apiKeyId: auth.apiKeyId,
          previousStatus: "EXECUTING",
        },
        completedAt: expect.any(Date),
      }),
    });

    expect(createTaskRunEvent).toHaveBeenCalledWith(expect.anything(), {
      taskRunId: RUN_ID,
      taskAttemptId: ATTEMPT_ID,
      type: "task.run.canceled",
      level: "WARN",
      message: "Task run canceled by API request",
      data: {
        apiKeyId: auth.apiKeyId,
        previousStatus: "EXECUTING",
        attemptNumber: 2,
      },
    });
  });

  it("returns conflict if the run changes before cancel is committed", async () => {
    prisma.taskRun.findFirst.mockResolvedValue(
      createRun({
        status: "PENDING",
      }),
    );

    txTaskRunUpdateMany.mockResolvedValue({
      count: 0,
    });

    const result = await cancelTaskRun({
      auth,
      runId: RUN_ID,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "RUN_NOT_CANCELABLE",
        message: "Task run status changed before it could be canceled",
      },
    });

    expect(createTaskRunEvent).not.toHaveBeenCalled();
  });
});
