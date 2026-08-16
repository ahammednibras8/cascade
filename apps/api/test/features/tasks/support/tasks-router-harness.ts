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
  deleteTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  deactivateDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTask: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  getDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  listDeployments: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTaskRunEvents: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTasks: vi.fn<(input: unknown) => Promise<unknown>>(),
  listApiKeys: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTaskSchedules: vi.fn<(input: unknown) => Promise<unknown>>(),
  revokeApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
  rotateApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
  resumeTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  rollbackDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  streamTaskRunEvents: vi.fn<(input: unknown) => Promise<unknown>>(),
  streamEnvironmentRuns: vi.fn<(input: unknown) => Promise<unknown>>(),
  pauseTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  updateTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
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
  deleteTaskSchedule,
  deactivateDeployment,
  getTaskRun,
  getTask,
  getTaskSchedule,
  getDeployment,
  listDeployments,
  listTaskRunEvents,
  listTasks,
  listApiKeys,
  listTaskSchedules,
  pauseTaskSchedule,
  prisma,
  replayTaskRun,
  rollbackDeployment,
  triggerTaskRun,
  revokeApiKey,
  rotateApiKey,
  resumeTaskSchedule,
  streamTaskRunEvents,
  streamEnvironmentRuns,
  updateTaskSchedule,
} = routeMocks;

vi.mock("../../../../src/features/task-runs/trigger-task-run.js", () => ({
  triggerTaskRun: routeMocks.triggerTaskRun,
}));

vi.mock("../../../../src/features/task-runs/cancel-task-run.js", () => ({
  cancelTaskRun: routeMocks.cancelTaskRun,
}));

vi.mock("../../../../src/features/task-runs/replay-task-run.js", () => ({
  replayTaskRun: routeMocks.replayTaskRun,
}));

vi.mock("../../../../src/features/schedules/create-task-schedule.js", () => ({
  createTaskSchedule: routeMocks.createTaskSchedule,
}));

vi.mock("../../../../src/features/deployments/create-deployment.js", () => ({
  createDeployment: routeMocks.createDeployment,
}));

vi.mock("../../../../src/features/task-runs/get-task-run.js", () => ({
  getTaskRun: routeMocks.getTaskRun,
}));

vi.mock("../../../../src/features/task-runs/list-task-run-events.js", () => ({
  listTaskRunEvents: routeMocks.listTaskRunEvents,
}));

vi.mock("../../../../src/features/tasks/list-tasks.js", () => ({
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

vi.mock("../../../../src/features/api-keys/list-api-keys.js", () => ({
  listApiKeys: routeMocks.listApiKeys,
}));

vi.mock("../../../../src/features/api-keys/create-api-key.js", () => ({
  createApiKey: routeMocks.createApiKey,
}));

vi.mock("../../../../src/features/api-keys/revoke-api-key.js", () => ({
  revokeApiKey: routeMocks.revokeApiKey,
}));

vi.mock("../../../../src/features/api-keys/rotate-api-key.js", () => ({
  rotateApiKey: routeMocks.rotateApiKey,
}));

vi.mock("../../../../src/features/schedules/list-task-schedules.js", () => ({
  listTaskSchedules: routeMocks.listTaskSchedules,
}));

vi.mock("../../../../src/features/schedules/pause-task-schedule.js", () => ({
  pauseTaskSchedule: routeMocks.pauseTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/resume-task-schedule.js", () => ({
  resumeTaskSchedule: routeMocks.resumeTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/delete-task-schedule.js", () => ({
  deleteTaskSchedule: routeMocks.deleteTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/update-task-schedule.js", () => ({
  updateTaskSchedule: routeMocks.updateTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/get-task-schedule.js", () => ({
  getTaskSchedule: routeMocks.getTaskSchedule,
}));

vi.mock("../../../../src/realtime/run-event-stream.js", () => ({
  streamTaskRunEvents: routeMocks.streamTaskRunEvents,
}));

vi.mock("../../../../src/realtime/environment-runs-stream.js", () => ({
  streamEnvironmentRuns: routeMocks.streamEnvironmentRuns,
}));

vi.mock("../../../../src/features/deployments/get-deployment.js", () => ({
  getDeployment: routeMocks.getDeployment,
}));

vi.mock("../../../../src/features/deployments/list-deployments.js", () => ({
  listDeployments: routeMocks.listDeployments,
}));

vi.mock("../../../../src/features/deployments/deactivate-deployment.js", () => ({
  deactivateDeployment: routeMocks.deactivateDeployment,
}));

vi.mock("../../../../src/features/deployments/rollback-deployment.js", () => ({
  rollbackDeployment: routeMocks.rollbackDeployment,
}));

vi.mock("../../../../src/features/tasks/get-task.js", () => ({
  getTask: routeMocks.getTask,
}));

const { apiRouter } = await import("../../../../src/routes/api-router.js");

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

  app.use("/api", apiRouter);

  return app;
}
