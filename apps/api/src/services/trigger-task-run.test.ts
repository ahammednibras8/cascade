import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../auth/api-key.js";
import { hashTriggerRequest } from "../lib/idempotency.js";

type TransactionClient = {
  taskRun: {
    create: (args: unknown) => Promise<unknown>;
  };
  taskEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const TRACE_ID = "11111111111111111111111111111111";
const SPAN_ID = "2222222222222222";

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
  taskRun: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
  $transaction: vi.fn<(callback: TransactionCallback) => Promise<unknown>>(),
}));

const txTaskRunCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());
const txTaskEventCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const enqueueTaskRun = vi.hoisted(() =>
  vi.fn<(message: unknown, options?: unknown) => Promise<void>>(),
);

const maybeStoreJsonValue = vi.hoisted(() =>
  vi.fn<(input: { value: unknown }) => Promise<unknown>>(),
);

const randomUUID = vi.hoisted(() => vi.fn<() => string>());

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma,
}));

vi.mock("../queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

vi.mock("@cascade/storage", () => ({
  maybeStoreJsonValue,
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();

  return {
    ...actual,
    randomUUID,
  };
});

vi.mock("@cascade/core", () => ({
  parseTraceparent: vi.fn<(traceparent: string | undefined) => null>(() => null),
  createRootTraceContext: vi.fn<
    () => {
      traceId: string;
      spanId: string;
      parentSpanId: null;
    }
  >(() => ({
    traceId: TRACE_ID,
    spanId: SPAN_ID,
    parentSpanId: null,
  })),
  createChildTraceContext: vi.fn<
    (input: { traceId: string; parentSpanId: string }) => {
      traceId: string;
      spanId: string;
      parentSpanId: string;
    }
  >(),
  toTraceparent: vi.fn<(input: { traceId: string; spanId: string }) => string>(
    (input) => `00-${input.traceId}-${input.spanId}-01`,
  ),
}));

const { triggerTaskRun } = await import("./trigger-task-run.js");

function createTask() {
  return {
    id: TASK_ID,
    slug: "hello",
    name: "Hello",
    deploymentId: "deployment-1",
  };
}

function createTaskRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    taskId: TASK_ID,
    status: "PENDING",
    payload: {
      message: "hello",
    },
    createdAt: CREATED_AT,
    idempotencyRequestHash: null,
    delayUntil: null,
    traceId: TRACE_ID,
    triggerSpanId: SPAN_ID,
    deploymentId: "deployment-1",
    ...overrides,
  };
}

describe("triggerTaskRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    randomUUID.mockReturnValue(RUN_ID);

    maybeStoreJsonValue.mockImplementation(async (input) => input.value);

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

    txTaskEventCreate.mockResolvedValue({
      id: "event-1",
    });
  });

  it("rejects invalid task ids", async () => {
    const result = await triggerTaskRun({
      auth,
      taskId: "not-a-uuid",
      body: {
        payload: {
          message: "hello",
        },
      },
      idempotencyKey: undefined,
      traceparent: undefined,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_TASK_ID",
        message: "taskId must be a valid UUID",
      },
    });

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("rejects tasks outside the authenticated environment", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const result = await triggerTaskRun({
      auth,
      taskId: TASK_ID,
      body: {
        payload: {
          message: "hello",
        },
      },
      idempotencyKey: undefined,
      traceparent: undefined,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task was not found in this environment",
      },
    });

    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: TASK_ID,
          environmentId: auth.environmentId,
        },
      }),
    );

    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("creates a pending task run, writes a trigger event, and enqueues the run", async () => {
    prisma.task.findFirst.mockResolvedValue(createTask());
    txTaskRunCreate.mockResolvedValue(createTaskRun());

    const result = await triggerTaskRun({
      auth,
      taskId: TASK_ID,
      body: {
        payload: {
          message: "hello",
        },
      },
      idempotencyKey: undefined,
      traceparent: undefined,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected triggerTaskRun to succeed");
    }

    expect(result.status).toBe(202);
    expect(result.idempotentReplayed).toBe(false);
    expect(result.taskRun).toEqual({
      id: RUN_ID,
      taskId: TASK_ID,
      taskSlug: "hello",
      taskName: "Hello",
      status: "PENDING",
      payload: {
        message: "hello",
      },
      createdAt: CREATED_AT.toISOString(),
      idempotentReplay: false,
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
    });

    expect(maybeStoreJsonValue).toHaveBeenCalledWith({
      kind: "PAYLOAD",
      environmentId: auth.environmentId,
      taskId: TASK_ID,
      runId: RUN_ID,
      value: {
        message: "hello",
      },
    });

    expect(txTaskRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: RUN_ID,
          taskId: TASK_ID,
          status: "PENDING",
          traceId: TRACE_ID,
          triggerSpanId: SPAN_ID,
          deploymentId: "deployment-1",
          payload: {
            message: "hello",
          },
        }),
      }),
    );

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          type: "task.triggered",
          level: "INFO",
          message: "Task trigger accepted and run is pending",
        }),
      }),
    );

    expect(enqueueTaskRun).toHaveBeenCalledWith(
      {
        runId: RUN_ID,
        taskId: TASK_ID,
        environmentId: auth.environmentId,
        deploymentId: "deployment-1",
      },
      {
        delayMs: 0,
      },
    );
  });

  it("returns an existing run for a matching idempotent replay", async () => {
    const payload = {
      message: "hello",
    };

    const idempotencyRequestHash = hashTriggerRequest({
      taskId: TASK_ID,
      payload,
      delayUntil: undefined,
    });

    prisma.task.findFirst.mockResolvedValue(createTask());
    prisma.taskRun.findFirst.mockResolvedValue(
      createTaskRun({
        idempotencyRequestHash,
      }),
    );

    const result = await triggerTaskRun({
      auth,
      taskId: TASK_ID,
      body: {
        payload,
      },
      idempotencyKey: "trigger-request-1",
      traceparent: undefined,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected triggerTaskRun to succeed");
    }

    expect(result.status).toBe(200);
    expect(result.idempotentReplayed).toBe(true);
    expect(result.taskRun.idempotentReplay).toBe(true);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("rejects idempotency key reuse with a different request", async () => {
    prisma.task.findFirst.mockResolvedValue(createTask());
    prisma.taskRun.findFirst.mockResolvedValue(
      createTaskRun({
        idempotencyRequestHash: "different-request-hash",
      }),
    );

    const result = await triggerTaskRun({
      auth,
      taskId: TASK_ID,
      body: {
        payload: {
          message: "hello",
        },
      },
      idempotencyKey: "trigger-request-1",
      traceparent: undefined,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This Idempotency-Key was already used with a different trigger request",
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });
});
