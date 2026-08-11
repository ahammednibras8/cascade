import { vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

type TransactionClient = {
  taskRun: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;

export const TASK_ID = "11111111-1111-4111-8111-111111111111";
export const RUN_ID = "22222222-2222-4222-8222-222222222222";
export const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
export const TRACE_ID = "11111111111111111111111111111111";
export const SPAN_ID = "2222222222222222";

export const EXECUTION_CONFIG = {
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

export const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [],
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

const createTaskRunEvent = vi.hoisted(() =>
  vi.fn<(tx: unknown, data: unknown) => Promise<{ id: string }>>(),
);

const enqueueTaskRun = vi.hoisted(() =>
  vi.fn<(message: unknown, options?: unknown) => Promise<void>>(),
);

const maybeStoreJsonValue = vi.hoisted(() =>
  vi.fn<(input: { value: unknown }) => Promise<unknown>>(),
);

const randomUUID = vi.hoisted(() => vi.fn<() => string>());

const recordTaskRunTriggered = vi.hoisted(() => vi.fn<() => void>());

const parseTraceparent = vi.hoisted(() =>
  vi.fn<(traceparent: string | undefined) => { traceId: string; spanId: string } | null>(
    () => null,
  ),
);

const createRootTraceContext = vi.hoisted(() =>
  vi.fn<
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
);

const createChildTraceContext = vi.hoisted(() =>
  vi.fn<
    (input: { traceId: string; parentSpanId: string }) => {
      traceId: string;
      spanId: string;
      parentSpanId: string;
    }
  >(),
);

const toTraceparent = vi.hoisted(() =>
  vi.fn<(input: { traceId: string; spanId: string }) => string>(
    (input) => `00-${input.traceId}-${input.spanId}-01`,
  ),
);

export {
  createChildTraceContext,
  createRootTraceContext,
  enqueueTaskRun,
  maybeStoreJsonValue,
  parseTraceparent,
  prisma,
  recordTaskRunTriggered,
  createTaskRunEvent,
  txTaskRunCreate,
};

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma,
  createTaskRunEvent,
}));

vi.mock("@cascade/telemetry", () => ({
  recordTaskRunTriggered,
}));

vi.mock("../../../src/queue/task-runs.js", () => ({
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
  parseTraceparent,
  createRootTraceContext,
  createChildTraceContext,
  toTraceparent,
}));

const { triggerTaskRun } = await import("../../../src/services/trigger-task-run.js");

function createDefaultTriggerBody() {
  return {
    payload: {
      message: "hello",
    },
  };
}

export function createTask() {
  return {
    id: TASK_ID,
    slug: "hello",
    name: "Hello",
    deploymentId: "deployment-1",
    executionConfig: EXECUTION_CONFIG,
  };
}

export function createTaskRun(overrides: Record<string, unknown> = {}) {
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

export async function triggerByTaskId(
  input: {
    taskId?: string;
    body?: unknown;
    idempotencyKey?: string | undefined;
    traceparent?: string | undefined;
  } = {},
) {
  return triggerTaskRun({
    auth,
    taskId: input.taskId ?? TASK_ID,
    body: input.body ?? createDefaultTriggerBody(),
    idempotencyKey: input.idempotencyKey,
    traceparent: input.traceparent,
  });
}

export async function triggerByTaskSlug(
  input: {
    taskSlug?: string;
    body?: unknown;
    idempotencyKey?: string | undefined;
    traceparent?: string | undefined;
  } = {},
) {
  return triggerTaskRun({
    auth,
    taskSlug: input.taskSlug ?? "hello",
    body: input.body ?? createDefaultTriggerBody(),
    idempotencyKey: input.idempotencyKey,
    traceparent: input.traceparent,
  });
}

export function resetTriggerTaskRunHarness() {
  vi.clearAllMocks();

  prisma.task.findFirst.mockReset();
  prisma.taskRun.findFirst.mockReset();
  prisma.$transaction.mockReset();
  txTaskRunCreate.mockReset();
  createTaskRunEvent.mockReset();
  enqueueTaskRun.mockReset();
  maybeStoreJsonValue.mockReset();
  randomUUID.mockReset();
  recordTaskRunTriggered.mockReset();
  parseTraceparent.mockReset();
  createRootTraceContext.mockReset();
  createChildTraceContext.mockReset();
  toTraceparent.mockReset();

  parseTraceparent.mockReturnValue(null);
  createRootTraceContext.mockReturnValue({
    traceId: TRACE_ID,
    spanId: SPAN_ID,
    parentSpanId: null,
  });
  toTraceparent.mockImplementation((input) => `00-${input.traceId}-${input.spanId}-01`);
  randomUUID.mockReturnValue(RUN_ID);
  enqueueTaskRun.mockResolvedValue(undefined);
  maybeStoreJsonValue.mockImplementation(async (input) => input.value);
  prisma.$transaction.mockImplementation(async (callback) =>
    callback({
      taskRun: {
        create: txTaskRunCreate,
      },
    }),
  );
  createTaskRunEvent.mockResolvedValue({
    id: "event-1",
  });
}
