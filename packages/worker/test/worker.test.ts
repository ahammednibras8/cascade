import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShutdownSignal } from "../src/lifecycle/shutdown.js";
import type { TaskRunQueueMessage } from "../src/queue/task-runs.js";

const popTaskRunMessage = vi.hoisted(() => vi.fn<() => Promise<TaskRunQueueMessage | null>>());

const taskRegistry = vi.hoisted(() => ({
  get: vi.fn<(id: string) => unknown>(),
  has: vi.fn<(id: string) => boolean>(),
  list: vi.fn<() => unknown[]>(),
}));

const loadTaskRegistry = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

const processTaskRun = vi.hoisted(() =>
  vi.fn<(message: TaskRunQueueMessage, taskRegistry: unknown) => Promise<void>>(),
);

const taskRunQueueRedis = vi.hoisted(() => ({
  quit: vi.fn<() => Promise<void>>(),
}));

const prisma = vi.hoisted(() => ({
  $disconnect: vi.fn<() => Promise<void>>(),
}));

const startStuckRunSweeper = vi.hoisted(() => vi.fn<() => () => void>());
const stopStuckRunSweeper = vi.hoisted(() => vi.fn<() => void>());

const startPendingRunSweeper = vi.hoisted(() => vi.fn<() => () => void>());
const stopPendingRunSweeper = vi.hoisted(() => vi.fn<() => void>());

const startTaskScheduleScheduler = vi.hoisted(() => vi.fn<() => () => void>());
const stopTaskScheduleScheduler = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@cascade/core", () => ({
  packageName: "@cascade/core",
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

vi.mock("../src/queue/task-runs.js", () => ({
  popTaskRunMessage,
  taskRunQueueRedis,
}));

vi.mock("../src/task-run-processor.js", () => ({
  processTaskRun,
}));

vi.mock("../src/tasks/load-registry.js", () => ({
  loadTaskRegistry,
}));

vi.mock("../src/timers/stuck-run-sweeper.js", () => ({
  startStuckRunSweeper,
}));

vi.mock("../src/timers/pending-run-sweeper.js", () => ({
  startPendingRunSweeper,
}));

vi.mock("../src/timers/task-schedule-scheduler.js", () => ({
  startTaskScheduleScheduler,
}));

const { runWorker } = await import("../src/worker.js");

function createShutdownSignal() {
  let checks = 0;

  return {
    isShuttingDown() {
      checks += 1;

      return checks > 2;
    },
  } satisfies ShutdownSignal;
}

describe("runWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    stopStuckRunSweeper.mockReturnValue(undefined);
    stopPendingRunSweeper.mockReturnValue(undefined);
    stopTaskScheduleScheduler.mockReturnValue(undefined);

    startStuckRunSweeper.mockReturnValue(stopStuckRunSweeper);
    startPendingRunSweeper.mockReturnValue(stopPendingRunSweeper);
    startTaskScheduleScheduler.mockReturnValue(stopTaskScheduleScheduler);

    processTaskRun.mockResolvedValue(undefined);
    loadTaskRegistry.mockResolvedValue(taskRegistry);
    taskRunQueueRedis.quit.mockResolvedValue(undefined);
    prisma.$disconnect.mockResolvedValue(undefined);
  });

  it("polls Redis and processes a task run message", async () => {
    const message = {
      runId: "run-1",
      taskId: "task-1",
      environmentId: "environment-1",
      deploymentId: null,
    } satisfies TaskRunQueueMessage;

    popTaskRunMessage.mockResolvedValueOnce(message).mockResolvedValueOnce(null);

    await runWorker(createShutdownSignal());

    expect(startStuckRunSweeper).toHaveBeenCalledOnce();
    expect(startPendingRunSweeper).toHaveBeenCalledOnce();
    expect(startTaskScheduleScheduler).toHaveBeenCalledOnce();

    expect(loadTaskRegistry).toHaveBeenCalledOnce();
    expect(popTaskRunMessage).toHaveBeenCalledOnce();
    expect(processTaskRun).toHaveBeenCalledWith(message, taskRegistry);

    expect(stopStuckRunSweeper).toHaveBeenCalledOnce();
    expect(stopPendingRunSweeper).toHaveBeenCalledOnce();
    expect(stopTaskScheduleScheduler).toHaveBeenCalledOnce();

    expect(taskRunQueueRedis.quit).toHaveBeenCalledOnce();
    expect(prisma.$disconnect).toHaveBeenCalledOnce();
  });

  it("does not process anything when Redis returns no message", async () => {
    popTaskRunMessage.mockResolvedValue(null);

    await runWorker(createShutdownSignal());

    expect(popTaskRunMessage).toHaveBeenCalledTimes(2);
    expect(processTaskRun).not.toHaveBeenCalled();

    expect(taskRunQueueRedis.quit).toHaveBeenCalledOnce();
    expect(prisma.$disconnect).toHaveBeenCalledOnce();
  });
});
