import express from "express";
import { vi } from "vitest";
import type { ApiKeyScope } from "@cascade/database";

export const RUN_ID = "22222222-2222-4222-8222-222222222222";
export const TASK_ID = "11111111-1111-4111-8111-111111111111";

const ALL_API_KEY_SCOPES: ApiKeyScope[] = [
  "TASKS_READ",
  "TASKS_TRIGGER",
  "SCHEDULES_WRITE",
  "RUNS_READ",
  "RUNS_CANCEL",
  "RUNS_REPLAY",
  "DEPLOYMENTS_WRITE",
  "API_KEYS_MANAGE",
];

export const AUTH_CONTEXT = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [...ALL_API_KEY_SCOPES],
};

const routeMocks = vi.hoisted(() => ({
  triggerTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  cancelTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  replayTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  createTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  createDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  createApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTaskRunEvents: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTasks: vi.fn<(input: unknown) => Promise<unknown>>(),
  listApiKeys: vi.fn<(input: unknown) => Promise<unknown>>(),
  revokeApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
  rotateApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
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
  createApiKey,
  getTaskRun,
  listTaskRunEvents,
  listTasks,
  listApiKeys,
  prisma,
  replayTaskRun,
  triggerTaskRun,
  revokeApiKey,
  rotateApiKey,
} = routeMocks;

vi.mock("../../src/services/trigger-task-run.js", () => ({
  triggerTaskRun: routeMocks.triggerTaskRun,
}));

vi.mock("../../src/services/cancel-task-run.js", () => ({
  cancelTaskRun: routeMocks.cancelTaskRun,
}));

vi.mock("../../src/services/replay-task-run.js", () => ({
  replayTaskRun: routeMocks.replayTaskRun,
}));

vi.mock("../../src/services/create-task-schedule.js", () => ({
  createTaskSchedule: routeMocks.createTaskSchedule,
}));

vi.mock("../../src/services/create-deployment.js", () => ({
  createDeployment: routeMocks.createDeployment,
}));

vi.mock("../../src/services/get-task-run.js", () => ({
  getTaskRun: routeMocks.getTaskRun,
}));

vi.mock("../../src/services/list-task-run-events.js", () => ({
  listTaskRunEvents: routeMocks.listTaskRunEvents,
}));

vi.mock("../../src/services/list-tasks.js", () => ({
  listTasks: routeMocks.listTasks,
}));

vi.mock("@cascade/database", () => ({
  ApiKeyScope: {
    TASKS_READ: "TASKS_READ",
    TASKS_TRIGGER: "TASKS_TRIGGER",
    SCHEDULES_WRITE: "SCHEDULES_WRITE",
    RUNS_READ: "RUNS_READ",
    RUNS_CANCEL: "RUNS_CANCEL",
    RUNS_REPLAY: "RUNS_REPLAY",
    DEPLOYMENTS_WRITE: "DEPLOYMENTS_WRITE",
    API_KEYS_MANAGE: "API_KEYS_MANAGE",
  },
  prisma: routeMocks.prisma,
}));

vi.mock("../../src/services/list-api-keys.js", () => ({
  listApiKeys: routeMocks.listApiKeys,
}));

vi.mock("../../src/services/create-api-key.js", () => ({
  createApiKey: routeMocks.createApiKey,
}));

vi.mock("../../src/services/revoke-api-key.js", () => ({
  revokeApiKey: routeMocks.revokeApiKey,
}));

vi.mock("../../src/services/rotate-api-key.js", () => ({
  rotateApiKey: routeMocks.rotateApiKey,
}));

const { tasksRouter } = await import("../../src/routes/tasks.js");

export function createApp(input: { scopes?: ApiKeyScope[] } = {}) {
  const app = express();

  app.use(express.json());

  app.use((request, _response, next) => {
    request.auth = {
      ...AUTH_CONTEXT,
      scopes: input.scopes ?? AUTH_CONTEXT.scopes,
    };
    next();
  });

  app.use("/api", tasksRouter);

  return app;
}
