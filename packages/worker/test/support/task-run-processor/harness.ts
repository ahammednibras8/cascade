import { vi } from "vitest";
import type { TaskExecutionConfig } from "@cascade/core";
import type { TaskRunQueueMessage } from "../../../src/queue/task-runs.js";
import {
  PARENT_SPAN_ID,
  SPAN_ID,
  TRACE_ID,
  createAttempt,
  createPendingTaskRun,
  createTaskRegistry,
  resetTaskExecutionConfig,
} from "./fixtures.js";

export {
  ATTEMPT_ID,
  ENVIRONMENT_ID,
  PARENT_SPAN_ID,
  RUN_ID,
  SPAN_ID,
  TASK_ID,
  TRACE_ID,
  createAttempt,
  createMessage,
} from "./fixtures.js";

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

const withRemoteParentSpan = vi.hoisted(() =>
  vi.fn<(_input: unknown, run: (traceContext: unknown) => Promise<unknown>) => Promise<unknown>>(),
);

const recordTaskRunExecution = vi.hoisted(() => vi.fn<(input: unknown) => void>());

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
  withRemoteParentSpan,
  recordTaskRunExecution,
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
  toTraceparent: vi.fn<
    (input: { traceId: string; spanId: string; traceFlags?: "00" | "01" }) => string
  >(
    (input: { traceId: string; spanId: string; traceFlags?: "00" | "01" }) =>
      `00-${input.traceId}-${input.spanId}-${input.traceFlags ?? "01"}`,
  ),
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

vi.mock("@cascade/telemetry", () => ({
  recordTaskRunExecution,
  withRemoteParentSpan,
}));

export const taskRegistry = createTaskRegistry(localTaskRun);

export const { processTaskRun } = await import("../../../src/task-run-processor.js");

export function resetTaskRunProcessorHarness() {
  vi.clearAllMocks();

  withRemoteParentSpan.mockImplementation(async (_input, run) =>
    run({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      parentSpanId: PARENT_SPAN_ID,
      traceFlags: "01",
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
    }),
  );

  mockTransactionClient();

  prisma.taskRun.findFirst.mockResolvedValue(createPendingTaskRun(taskExecutionConfig));
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

  resetTaskExecutionConfig(taskExecutionConfig);
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
