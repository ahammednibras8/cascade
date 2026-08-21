import { TASK_ID } from "../../support/route-test-app.js";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const TRACEPARENT = "00-11111111111111111111111111111111-2222222222222222-01";

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

export function createTriggerTaskRunSuccess(
  input: {
    status?: 200 | 202;
    idempotentReplayed?: boolean;
    payload?: unknown;
  } = {},
) {
  const idempotentReplayed = input.idempotentReplayed ?? false;

  return {
    ok: true,
    status: input.status ?? 202,
    idempotentReplayed,
    taskRun: {
      id: "run-1",
      taskId: TASK_ID,
      taskSlug: "hello",
      taskName: "Hello",
      status: "PENDING",
      payload: input.payload ?? {
        message: "hello",
      },
      createdAt: CREATED_AT,
      idempotentReplay: idempotentReplayed,
      traceparent: TRACEPARENT,
    },
  };
}

export function createListTasksSuccess() {
  return {
    ok: true,
    status: 200,
    tasks: [
      {
        id: "task-1",
        slug: "hello",
        name: "Hello",
        description: "Greets a user",
        deployment: {
          id: "deployment-1",
          version: "v1",
          status: "ACTIVE",
        },
        runsCount: 3,
        schedulesCount: 2,
        createdAt: CREATED_AT,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    pagination: {
      limit: 50,
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    },
  };
}

export function createGetTaskSuccess() {
  return {
    ok: true,
    status: 200,
    task: {
      id: TASK_ID,
      slug: "hello",
      name: "Hello",
      description: "Greets a user",
      executionConfig: EXECUTION_CONFIG,
      createdAt: CREATED_AT,
      updatedAt: "2026-01-02T00:00:00.000Z",
      deployment: {
        id: "deployment-1",
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        status: "ACTIVE",
        runtimeStatus: "RUNNING",
      },
      runsCount: 3,
      schedulesCount: 1,
      schedules: [],
      recentRuns: [],
    },
  };
}
