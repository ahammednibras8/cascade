import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShutdownSignal } from "../src/lifecycle/shutdown.js";
import type { TaskRunQueueMessage } from "../src/queue/task-runs.js";

const popTaskRunMessage = vi.hoisted(() => vi.fn<() => Promise<TaskRunQueueMessage | null>>());

const workerRole = vi.hoisted(
  (): {
    current: "control" | "deployment" | "local";
  } => ({
    current: "local",
  }),
);

const taskRegistry = vi.hoisted(() => ({
  get: vi.fn<(id: string) => unknown>(),
  has: vi.fn<(id: string) => boolean>(),
  list: vi.fn<() => unknown[]>(),
}));

const loadTaskRegistry = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

const processTaskRun = vi.hoisted(() =>
  vi.fn<(message: TaskRunQueueMessage, taskRegistry: unknown) => Promise<void>>(),
);

const disconnectTaskRunQueueRedis = vi.hoisted(() => vi.fn<() => void>());

const prisma = vi.hoisted(() => ({
  $disconnect: vi.fn<() => Promise<void>>(),
}));

const startStuckRunSweeper = vi.hoisted(() => vi.fn<() => () => void>());
const stopStuckRunSweeper = vi.hoisted(() => vi.fn<() => void>());

const startPendingRunSweeper = vi.hoisted(() => vi.fn<() => () => void>());
const stopPendingRunSweeper = vi.hoisted(() => vi.fn<() => void>());

const startTaskScheduleScheduler = vi.hoisted(() => vi.fn<() => () => void>());
const stopTaskScheduleScheduler = vi.hoisted(() => vi.fn<() => void>());

const startRunEventOutboxDispatcher = vi.hoisted(() => vi.fn<() => () => void>());
const stopRunEventOutboxDispatcher = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@cascade/core", () => ({
  packageName: "@cascade/core",
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

vi.mock("../src/config.js", () => ({
  WORKER_CONCURRENCY: 4,
  get WORKER_ROLE() {
    return workerRole.current;
  },
}));

vi.mock("../src/queue/task-runs.js", () => ({
  disconnectTaskRunQueueRedis,
  popTaskRunMessage,
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

vi.mock("../src/timers/run-event-outbox-dispatcher.js", () => ({
  startRunEventOutboxDispatcher,
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
    workerRole.current = "local";

    stopStuckRunSweeper.mockReturnValue(undefined);
    stopPendingRunSweeper.mockReturnValue(undefined);
    stopTaskScheduleScheduler.mockReturnValue(undefined);

    startStuckRunSweeper.mockReturnValue(stopStuckRunSweeper);
    startPendingRunSweeper.mockReturnValue(stopPendingRunSweeper);
    startTaskScheduleScheduler.mockReturnValue(stopTaskScheduleScheduler);

    processTaskRun.mockResolvedValue(undefined);
    loadTaskRegistry.mockResolvedValue(taskRegistry);
    prisma.$disconnect.mockResolvedValue(undefined);

    stopRunEventOutboxDispatcher.mockReturnValue(undefined);
    startRunEventOutboxDispatcher.mockReturnValue(stopRunEventOutboxDispatcher);
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

    expect(startStuckRunSweeper).not.toHaveBeenCalled();
    expect(startPendingRunSweeper).not.toHaveBeenCalled();
    expect(startTaskScheduleScheduler).not.toHaveBeenCalled();
    expect(startRunEventOutboxDispatcher).not.toHaveBeenCalled();

    expect(loadTaskRegistry).toHaveBeenCalledOnce();
    expect(popTaskRunMessage).toHaveBeenCalledTimes(2);
    expect(processTaskRun).toHaveBeenCalledWith(message, taskRegistry);

    expect(stopStuckRunSweeper).not.toHaveBeenCalled();
    expect(stopPendingRunSweeper).not.toHaveBeenCalled();
    expect(stopTaskScheduleScheduler).not.toHaveBeenCalled();
    expect(stopRunEventOutboxDispatcher).not.toHaveBeenCalled();

    expect(disconnectTaskRunQueueRedis).toHaveBeenCalledOnce();
    expect(prisma.$disconnect).toHaveBeenCalledOnce();
  });

  it("does not process anything when Redis returns no message", async () => {
    popTaskRunMessage.mockResolvedValue(null);

    await runWorker(createShutdownSignal());

    expect(popTaskRunMessage).toHaveBeenCalledTimes(2);
    expect(processTaskRun).not.toHaveBeenCalled();

    expect(disconnectTaskRunQueueRedis).toHaveBeenCalledOnce();
    expect(prisma.$disconnect).toHaveBeenCalledOnce();
  });

  it("runs control sweepers without polling the queue", async () => {
    workerRole.current = "control";

    await runWorker(createShutdownSignal());

    expect(startStuckRunSweeper).toHaveBeenCalledOnce();
    expect(startPendingRunSweeper).toHaveBeenCalledOnce();
    expect(startTaskScheduleScheduler).toHaveBeenCalledOnce();
    expect(startRunEventOutboxDispatcher).toHaveBeenCalledOnce();

    expect(loadTaskRegistry).not.toHaveBeenCalled();
    expect(popTaskRunMessage).not.toHaveBeenCalled();
    expect(processTaskRun).not.toHaveBeenCalled();

    expect(stopStuckRunSweeper).toHaveBeenCalledOnce();
    expect(stopPendingRunSweeper).toHaveBeenCalledOnce();
    expect(stopTaskScheduleScheduler).toHaveBeenCalledOnce();
    expect(stopRunEventOutboxDispatcher).toHaveBeenCalledOnce();
  });
});
