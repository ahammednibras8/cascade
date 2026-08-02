import express from "express";
import { vi } from "vitest";

export const RUN_ID = "22222222-2222-4222-8222-222222222222";
export const TASK_ID = "11111111-1111-4111-8111-111111111111";

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

export const AUTH_CONTEXT = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
};

const routeMocks = vi.hoisted(() => ({
  triggerTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  cancelTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  replayTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  createTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  createDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTaskRunEvents: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTasks: vi.fn<(input: unknown) => Promise<unknown>>(),
  prisma: {
    taskRun: {
      findMany: vi.fn<(input: unknown) => Promise<unknown[]>>(),
    },
  },
}));

export const {
  cancelTaskRun,
  createDeployment,
  createTaskSchedule,
  getTaskRun,
  listTaskRunEvents,
  listTasks,
  prisma,
  replayTaskRun,
  triggerTaskRun,
} = routeMocks;

vi.mock("../../src/services/trigger-task-run.js", () => ({
  triggerTaskRun,
}));

vi.mock("../../src/services/cancel-task-run.js", () => ({
  cancelTaskRun,
}));

vi.mock("../../src/services/replay-task-run.js", () => ({
  replayTaskRun,
}));

vi.mock("../../src/services/create-task-schedule.js", () => ({
  createTaskSchedule,
}));

vi.mock("../../src/services/create-deployment.js", () => ({
  createDeployment,
}));

vi.mock("../../src/services/get-task-run.js", () => ({
  getTaskRun,
}));

vi.mock("../../src/services/list-task-run-events.js", () => ({
  listTaskRunEvents,
}));

vi.mock("../../src/services/list-tasks.js", () => ({
  listTasks,
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { tasksRouter } = await import("../../src/routes/tasks.js");

export function createApp() {
  const app = express();

  app.use(express.json());

  app.use((request, _response, next) => {
    request.auth = AUTH_CONTEXT;
    next();
  });

  app.use("/api", tasksRouter);

  return app;
}

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
