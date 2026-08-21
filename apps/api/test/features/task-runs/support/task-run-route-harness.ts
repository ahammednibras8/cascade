import { vi } from "vitest";
import type { ApiKeyScope } from "@cascade/database";
import { createRouteTestApp } from "../../support/route-test-app.js";

const databaseMock = vi.hoisted(() => ({
  ApiKeyScope: {
    RUNS_READ: "RUNS_READ",
    RUNS_CANCEL: "RUNS_CANCEL",
    RUNS_REPLAY: "RUNS_REPLAY",
  },
}));

const taskRunRouteMocks = vi.hoisted(() => ({
  cancelTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  getTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTaskRunEvents: vi.fn<(input: unknown) => Promise<unknown>>(),
  listTaskRuns: vi.fn<(input: unknown) => Promise<unknown>>(),
  replayTaskRun: vi.fn<(input: unknown) => Promise<unknown>>(),
  streamEnvironmentRuns: vi.fn<(input: unknown) => Promise<unknown>>(),
  streamTaskRunEvents: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

export const {
  cancelTaskRun,
  getTaskRun,
  listTaskRunEvents,
  listTaskRuns,
  replayTaskRun,
  streamEnvironmentRuns,
  streamTaskRunEvents,
} = taskRunRouteMocks;

vi.mock("@cascade/database", () => databaseMock);

vi.mock("../../../../src/features/task-runs/cancel-task-run.js", () => ({
  cancelTaskRun: taskRunRouteMocks.cancelTaskRun,
}));

vi.mock("../../../../src/features/task-runs/get-task-run.js", () => ({
  getTaskRun: taskRunRouteMocks.getTaskRun,
}));

vi.mock("../../../../src/features/task-runs/list-task-run-events.js", () => ({
  listTaskRunEvents: taskRunRouteMocks.listTaskRunEvents,
}));

vi.mock("../../../../src/features/task-runs/list-task-runs.js", () => ({
  listTaskRuns: taskRunRouteMocks.listTaskRuns,
}));

vi.mock("../../../../src/features/task-runs/replay-task-run.js", () => ({
  replayTaskRun: taskRunRouteMocks.replayTaskRun,
}));

vi.mock("../../../../src/realtime/environment-runs-stream.js", () => ({
  streamEnvironmentRuns: taskRunRouteMocks.streamEnvironmentRuns,
}));

vi.mock("../../../../src/realtime/run-event-stream.js", () => ({
  streamTaskRunEvents: taskRunRouteMocks.streamTaskRunEvents,
}));

const { taskRunRoutes } = await import("../../../../src/features/task-runs/task-run-routes.js");

export function createApp(input: { scopes?: ApiKeyScope[] } = {}) {
  return createRouteTestApp(taskRunRoutes, input);
}
