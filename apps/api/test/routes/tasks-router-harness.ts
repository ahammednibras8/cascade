import express from "express";
import { vi } from "vitest";

export const RUN_ID = "22222222-2222-4222-8222-222222222222";
export const TASK_ID = "11111111-1111-4111-8111-111111111111";

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
