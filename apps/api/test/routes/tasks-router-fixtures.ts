import { RUN_ID, TASK_ID } from "./tasks-router-harness.js";

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

export function createDeploymentBody(
  input: {
    version?: string;
    image?: string;
  } = {},
) {
  return {
    version: input.version ?? "v1",
    image: input.image ?? "ghcr.io/cascade/worker:v1",
    tasks: [
      {
        slug: "hello",
        name: "Hello",
        executionConfig: EXECUTION_CONFIG,
      },
    ],
  };
}

export function createDeploymentSuccess() {
  return {
    ok: true,
    status: 201,
    deployment: {
      id: "deployment-1",
      environmentId: "environment-1",
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      status: "ACTIVE",
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
        },
      ],
      createdAt: CREATED_AT,
    },
  };
}

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

export function createCancelTaskRunSuccess() {
  return {
    ok: true,
    status: 200,
    taskRun: {
      id: RUN_ID,
      taskId: TASK_ID,
      status: "CANCELED",
      canceled: true,
      alreadyCanceled: false,
    },
  };
}

export function createReplayTaskRunSuccess() {
  return {
    ok: true,
    status: 202,
    taskRun: {
      id: "33333333-3333-4333-8333-333333333333",
      taskId: TASK_ID,
      status: "PENDING",
      payload: {
        message: "hello",
      },
      createdAt: CREATED_AT,
      replayedFromRunId: RUN_ID,
    },
  };
}

export function createTaskScheduleSuccess() {
  return {
    ok: true,
    status: 201,
    schedule: {
      id: "33333333-3333-4333-8333-333333333333",
      taskId: TASK_ID,
      name: "Every minute",
      intervalSeconds: 60,
      nextRunAt: "2026-01-01T00:01:00.000Z",
      enabled: true,
      payload: {
        message: "scheduled hello",
      },
      createdAt: CREATED_AT,
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
  };
}

export function createDeploymentVersionExistsFailure() {
  return {
    ok: false,
    status: 409,
    error: {
      code: "DEPLOYMENT_VERSION_EXISTS",
      message: "A deployment with this version already exists in the environment",
    },
  };
}

export function createListTaskSchedulesSuccess() {
  return {
    ok: true,
    status: 200,
    schedules: [
      {
        id: "schedule-1",
        taskId: "task-1",
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        nextRunAt: "2026-01-03T09:00:00.000Z",
        lastRunAt: null,
        enabled: true,
        hasPayload: true,
        revision: 3,
        createdAt: CREATED_AT,
        updatedAt: "2026-01-02T00:00:00.000Z",
        task: {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          deployment: {
            id: "deployment-1",
            version: "v3",
            status: "ACTIVE",
          },
        },
      },
    ],
  };
}

export function createPauseTaskScheduleSuccess() {
  return {
    ok: true,
    status: 200,
    schedule: {
      id: "33333333-3333-4333-8333-333333333333",
      enabled: false,
      alreadyPaused: false,
    },
  };
}

export function createResumeTaskScheduleSuccess() {
  return {
    ok: true,
    status: 200,
    schedule: {
      id: "33333333-3333-4333-8333-333333333333",
      enabled: true,
      alreadyResumed: false,
      nextRunAt: "2026-01-01T00:01:00.000Z",
    },
  };
}
