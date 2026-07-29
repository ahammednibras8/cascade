import { vi } from "vitest";
import type { TaskRunQueueMessage } from "../../../src/queue/task-runs.js";

export const RUN_ID = "run-1";
export const TASK_ID = "task-1";
export const ENVIRONMENT_ID = "environment-1";
export const ATTEMPT_ID = "attempt-1";
export const TRACE_ID = "11111111111111111111111111111111";
export const SPAN_ID = "2222222222222222";
export const PARENT_SPAN_ID = "3333333333333333";

type TransactionClient = {
  taskRun: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  taskAttempt: {
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<{ id: string; attemptNumber: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
  taskEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback<T> = (tx: TransactionClient) => Promise<T>;

type TaskExecutionConfig = {
  schemaVersion: 1;
  timeoutMs: number | null;
  retry: {
    maxAttempts: number;
    delayMs: number;
    exponentialBackoff: boolean;
  };
  queue: {
    name: string;
    concurrencyLimit: number | null;
  };
};

const localTaskRun = vi.hoisted(() => vi.fn<(context: unknown) => Promise<unknown>>());

const taskExecutionConfig = vi.hoisted(
  (): TaskExecutionConfig => ({
    schemaVersion: 1,
    timeoutMs: 30_000,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
      exponentialBackoff: false,
    },
    queue: {
      name: "hello",
      concurrencyLimit: null,
    },
  }),
);

const parseTaskExecutionConfig = vi.hoisted(() =>
  vi.fn<(value: unknown) => TaskExecutionConfig | null>((value) =>
    value === taskExecutionConfig ? taskExecutionConfig : null,
  ),
);

const prisma = vi.hoisted(() => ({
  taskRun: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
    findUnique: vi.fn<(args: unknown) => Promise<{ status: string } | null>>(),
    updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  },
  $transaction: vi.fn<<T>(callback: TransactionCallback<T>) => Promise<T>>(),
}));

const txTaskRunUpdateMany = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ count: number }>>(),
);

const txTaskAttemptCount = vi.hoisted(() => vi.fn<(args: unknown) => Promise<number>>());

const txTaskAttemptCreate = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ id: string; attemptNumber: number }>>(),
);

const txTaskAttemptUpdate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const txTaskEventCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const enqueueTaskRun = vi.hoisted(() =>
  vi.fn<(message: TaskRunQueueMessage, options?: unknown) => Promise<void>>(),
);

const resolveJsonValue = vi.hoisted(() => vi.fn<(value: unknown) => Promise<unknown>>());

const maybeStoreJsonValue = vi.hoisted(() =>
  vi.fn<(input: { value: unknown }) => Promise<unknown>>(),
);

const stopHeartbeat = vi.hoisted(() => vi.fn<() => void>());
const startTaskRunHeartbeat = vi.hoisted(() => vi.fn<(taskRunId: string) => () => void>());

const stopQueueConcurrencyHeartbeat = vi.hoisted(() => vi.fn<() => void>());
const startQueueConcurrencyLeaseHeartbeat = vi.hoisted(() =>
  vi.fn<(lease: unknown) => () => void>(),
);

const tryAcquireQueueConcurrency = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const releaseQueueConcurrency = vi.hoisted(() => vi.fn<(lease: unknown) => Promise<void>>());

export {
  enqueueTaskRun,
  localTaskRun,
  parseTaskExecutionConfig,
  maybeStoreJsonValue,
  prisma,
  releaseQueueConcurrency,
  startQueueConcurrencyLeaseHeartbeat,
  startTaskRunHeartbeat,
  stopHeartbeat,
  stopQueueConcurrencyHeartbeat,
  txTaskAttemptCount,
  txTaskAttemptCreate,
  txTaskAttemptUpdate,
  txTaskEventCreate,
  txTaskRunUpdateMany,
  taskExecutionConfig,
  tryAcquireQueueConcurrency,
};

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: "DB_NULL",
  },
  prisma,
}));

vi.mock("@cascade/core", () => ({
  packageName: "@cascade/core",
  parseTaskExecutionConfig,
  createRootTraceContext: vi.fn<() => unknown>(() => ({
    traceId: TRACE_ID,
    spanId: SPAN_ID,
    parentSpanId: null,
  })),
  createChildTraceContext: vi.fn<
    (input: { traceId: string; parentSpanId: string | null | undefined }) => unknown
  >((input) => ({
    traceId: input.traceId,
    spanId: SPAN_ID,
    parentSpanId: input.parentSpanId ?? null,
  })),
}));

vi.mock("@cascade/storage", () => ({
  resolveJsonValue,
  maybeStoreJsonValue,
}));

vi.mock("../../../src/queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

vi.mock("../../../src/queue/concurrency-limits.js", () => ({
  tryAcquireQueueConcurrency,
  releaseQueueConcurrency,
}));

vi.mock("../../../src/timers/queue-concurrency-lease.js", () => ({
  startQueueConcurrencyLeaseHeartbeat,
}));

vi.mock("../../../src/timers/task-run-heartbeat.js", () => ({
  startTaskRunHeartbeat,
}));

vi.mock("../../../src/tasks/registry.js", () => ({
  taskRegistry: {
    get: vi.fn<(id: string) => unknown>((id) => {
      if (id !== "hello") {
        return undefined;
      }

      return {
        id: "hello",
        timeoutMs: 30_000,
        retry: {
          maxAttempts: 1,
          delayMs: 0,
          exponentialBackoff: false,
        },
        queue: {
          name: "hello",
          concurrencyLimit: null,
        },
        run: localTaskRun,
      };
    }),
  },
}));

export const { processTaskRun } = await import("../../../src/task-run-processor.js");

export function createMessage() {
  return {
    runId: RUN_ID,
    taskId: TASK_ID,
    environmentId: ENVIRONMENT_ID,
    deploymentId: null,
  } satisfies TaskRunQueueMessage;
}

function createPendingTaskRun() {
  return {
    id: RUN_ID,
    taskId: TASK_ID,
    status: "PENDING",
    payload: {
      message: "hello",
    },
    delayUntil: null,
    traceId: TRACE_ID,
    triggerSpanId: PARENT_SPAN_ID,
    executionConfig: taskExecutionConfig,
    task: {
      slug: "hello",
      name: "Hello",
    },
  };
}

export function createAttempt(attemptNumber = 1) {
  return {
    id: ATTEMPT_ID,
    attemptNumber,
  };
}

export function resetTaskRunProcessorHarness() {
  vi.clearAllMocks();

  mockTransactionClient();

  prisma.taskRun.findFirst.mockResolvedValue(createPendingTaskRun());
  prisma.taskRun.findUnique.mockResolvedValue({ status: "EXECUTING" });
  prisma.taskRun.updateMany.mockResolvedValue({ count: 1 });

  txTaskRunUpdateMany.mockResolvedValue({ count: 1 });
  txTaskAttemptCount.mockResolvedValue(0);
  txTaskAttemptCreate.mockResolvedValue(createAttempt());
  txTaskAttemptUpdate.mockResolvedValue({});
  txTaskEventCreate.mockResolvedValue({});

  resolveJsonValue.mockResolvedValue({
    message: "hello",
  });

  maybeStoreJsonValue.mockImplementation(async (input) => input.value);

  localTaskRun.mockResolvedValue({
    ok: true,
  });

  startTaskRunHeartbeat.mockReturnValue(stopHeartbeat);
  startQueueConcurrencyLeaseHeartbeat.mockReturnValue(stopQueueConcurrencyHeartbeat);

  tryAcquireQueueConcurrency.mockResolvedValue(null);
  releaseQueueConcurrency.mockResolvedValue(undefined);
  enqueueTaskRun.mockResolvedValue(undefined);

  taskExecutionConfig.timeoutMs = 30_000;
  taskExecutionConfig.retry.maxAttempts = 1;
  taskExecutionConfig.retry.delayMs = 0;
  taskExecutionConfig.retry.exponentialBackoff = false;
  taskExecutionConfig.queue.name = "hello";
  taskExecutionConfig.queue.concurrencyLimit = null;
}

function mockTransactionClient() {
  prisma.$transaction.mockImplementation(async (callback) =>
    callback({
      taskRun: {
        updateMany: txTaskRunUpdateMany,
      },
      taskAttempt: {
        count: txTaskAttemptCount,
        create: txTaskAttemptCreate,
        update: txTaskAttemptUpdate,
      },
      taskEvent: {
        create: txTaskEventCreate,
      },
    }),
  );
}
