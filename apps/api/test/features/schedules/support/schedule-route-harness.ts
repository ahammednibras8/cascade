import { vi } from "vitest";
import type { ApiKeyScope } from "@cascade/database";
import { createRouteTestApp } from "../../support/route-test-app.js";

const databaseMock = vi.hoisted(() => ({
  ApiKeyScope: {
    TASKS_READ: "TASKS_READ",
    TASKS_TRIGGER: "TASKS_TRIGGER",
    SCHEDULES_WRITE: "SCHEDULES_WRITE",
  },
}));

const scheduleRouteMocks = vi.hoisted(() => ({
  createTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  deleteTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTask: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTaskSchedules: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTasks: vi.fn<(input: unknown) => Promise<unknown>>(),
  pauseTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  resumeTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  triggerTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  updateTaskSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

export const {
  createTaskSchedule,
  deleteTaskSchedule,
  getTaskSchedule,
  listTaskSchedules,
  pauseTaskSchedule,
  resumeTaskSchedule,
  updateTaskSchedule,
} = scheduleRouteMocks;

vi.mock("@cascade/database", () => databaseMock);

vi.mock("../../../../src/features/tasks/get-task.js", () => ({
  getTask: scheduleRouteMocks.getTask,
}));

vi.mock("../../../../src/features/tasks/list-tasks.js", () => ({
  listTasks: scheduleRouteMocks.listTasks,
}));

vi.mock("../../../../src/features/task-runs/trigger-task-run.js", () => ({
  triggerTaskRun: scheduleRouteMocks.triggerTaskRun,
}));

vi.mock("../../../../src/features/schedules/create-task-schedule.js", () => ({
  createTaskSchedule: scheduleRouteMocks.createTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/delete-task-schedule.js", () => ({
  deleteTaskSchedule: scheduleRouteMocks.deleteTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/get-task-schedule.js", () => ({
  getTaskSchedule: scheduleRouteMocks.getTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/list-task-schedules.js", () => ({
  listTaskSchedules: scheduleRouteMocks.listTaskSchedules,
}));

vi.mock("../../../../src/features/schedules/pause-task-schedule.js", () => ({
  pauseTaskSchedule: scheduleRouteMocks.pauseTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/resume-task-schedule.js", () => ({
  resumeTaskSchedule: scheduleRouteMocks.resumeTaskSchedule,
}));

vi.mock("../../../../src/features/schedules/update-task-schedule.js", () => ({
  updateTaskSchedule: scheduleRouteMocks.updateTaskSchedule,
}));

const { taskRoutes } = await import("../../../../src/features/tasks/task-routes.js");

export function createApp(input: { scopes?: ApiKeyScope[] } = {}) {
  return createRouteTestApp(taskRoutes, input);
}
