import { vi } from "vitest";
import type { TaskRunQueueMessage } from "../../queue/task-runs.js";

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

type LocalTaskRetry = {
  maxAttempts: number;
  delayMs: number;
  exponentialBackoff: boolean;
};

const localTaskRun = vi.hoisted(() => vi.fn<(context: unknown) => Promise<unknown>>());

const localTaskRetry = vi.hoisted(
  (): LocalTaskRetry => ({
    maxAttempts: 1,
    delayMs: 0,
    exponentialBackoff: false,
  }),
);

const prisma = vi.hoisted(() => ({
  taskRun: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
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
  localTaskRetry,
  localTaskRun,
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
};

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: "DB_NULL",
  },
  prisma,
}));

vi.mock("@cascade/core", () => ({
  packageName: "@cascade/core",
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

vi.mock("../../queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

vi.mock("../../queue/concurrency-limits.js", () => ({
  tryAcquireQueueConcurrency,
  releaseQueueConcurrency,
}));

vi.mock("../../timers/queue-concurrency-lease.js", () => ({
  startQueueConcurrencyLeaseHeartbeat,
}));

vi.mock("../../timers/task-run-heartbeat.js", () => ({
  startTaskRunHeartbeat,
}));

vi.mock("../../tasks/registry.js", () => ({
  taskRegistry: {
    get: vi.fn<(id: string) => unknown>((id) => {
      if (id !== "hello") {
        return undefined;
      }

      return {
        id: "hello",
        timeoutMs: 30_000,
        retry: localTaskRetry,
        queue: {
          name: "hello",
          concurrencyLimit: null,
        },
        run: localTaskRun,
      };
    }),
  },
}));

export const { processTaskRun } = await import("../../task-run-processor.js");

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

  localTaskRetry.maxAttempts = 1;
  localTaskRetry.delayMs = 0;
  localTaskRetry.exponentialBackoff = false;
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
