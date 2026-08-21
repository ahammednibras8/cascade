import type { TaskRunQueueMessage } from "../../src/queue/task-runs.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisInstance = vi.hoisted(() => ({
  on: vi.fn<(event: string, listener: () => void) => unknown>(),
  rpush: vi.fn<(key: string, message: string) => Promise<number>>(),
  zadd: vi.fn<(key: string, score: number, message: string) => Promise<number>>(),
  blpop: vi.fn<(key: string, timeoutSeconds: number) => Promise<[string, string] | null>>(),
  disconnect: vi.fn<() => void>(),
}));

const Redis = vi.hoisted(() =>
  vi.fn<(url: string, options: { maxRetriesPerRequest: null; lazyConnect: boolean }) => unknown>(
    function RedisMock() {
      return redisInstance;
    },
  ),
);

const runPromoteDelayedTaskRunsCommand = vi.hoisted(() =>
  vi.fn<
    (
      redis: unknown,
      input: {
        delayedQueueKey: string;
        queueKey: string;
        now: number;
        limit: number;
      },
    ) => Promise<number>
  >(),
);

vi.mock("ioredis", () => ({
  Redis,
}));

vi.mock("../../src/redis/promote-delayed-task-runs-command.js", () => ({
  runPromoteDelayedTaskRunsCommand,
}));

process.env["QUEUE_REDIS_URL"] = "redis://localhost:6379";

const { enqueueTaskRun, popTaskRunMessage } = await import("../../src/queue/task-runs.js");

const originalQueueRedisUrl = process.env["QUEUE_REDIS_URL"];
const originalDeploymentId = process.env["CASCADE_DEPLOYMENT_ID"];

function createMessage(deploymentId: string | null = null): TaskRunQueueMessage {
  return {
    runId: "run-1",
    taskId: "task-1",
    environmentId: "environment-1",
    deploymentId,
  };
}

describe("task run queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env["QUEUE_REDIS_URL"] = "redis://localhost:6379";
    delete process.env["CASCADE_DEPLOYMENT_ID"];

    redisInstance.rpush.mockResolvedValue(1);
    redisInstance.zadd.mockResolvedValue(1);
    redisInstance.blpop.mockResolvedValue(null);
    runPromoteDelayedTaskRunsCommand.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();

    process.env["QUEUE_REDIS_URL"] = originalQueueRedisUrl;
    process.env["CASCADE_DEPLOYMENT_ID"] = originalDeploymentId;
  });

  it("pushes immediate messages to the deployment queue", async () => {
    const message = createMessage("deployment-1");

    await enqueueTaskRun(message);

    expect(redisInstance.rpush).toHaveBeenCalledWith(
      "cascade:task-runs:deployment-1",
      JSON.stringify(message),
    );
    expect(redisInstance.zadd).not.toHaveBeenCalled();
  });

  it("stores delayed messages in the deployment delayed queue", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const message = createMessage("deployment-1");

    await enqueueTaskRun(message, {
      delayMs: 5_000,
    });

    expect(nowSpy).toHaveBeenCalledOnce();
    expect(redisInstance.zadd).toHaveBeenCalledWith(
      "cascade:task-run:delayed:deployment-1",
      6_000,
      JSON.stringify(message),
    );
    expect(redisInstance.rpush).not.toHaveBeenCalled();
  });

  it("promotes due local delayed messages before popping from Redis", async () => {
    const message = createMessage();
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    redisInstance.blpop.mockResolvedValue(["cascade:task-runs:local", JSON.stringify(message)]);

    const poppedMessage = await popTaskRunMessage();

    expect(runPromoteDelayedTaskRunsCommand).toHaveBeenCalledWith(redisInstance, {
      delayedQueueKey: "cascade:task-run:delayed:local",
      queueKey: "cascade:task-runs:local",
      now: 10_000,
      limit: 100,
    });

    expect(redisInstance.blpop).toHaveBeenCalledWith("cascade:task-runs:local", 5);
    expect(poppedMessage).toEqual(message);
  });

  it("pops only from this worker deployment queue", async () => {
    process.env["CASCADE_DEPLOYMENT_ID"] = "deployment-1";
    redisInstance.blpop.mockResolvedValue(null);

    const poppedMessage = await popTaskRunMessage();

    expect(runPromoteDelayedTaskRunsCommand).toHaveBeenCalledWith(
      redisInstance,
      expect.objectContaining({
        delayedQueueKey: "cascade:task-run:delayed:deployment-1",
        queueKey: "cascade:task-runs:deployment-1",
      }),
    );

    expect(redisInstance.blpop).toHaveBeenCalledWith("cascade:task-runs:deployment-1", 5);
    expect(poppedMessage).toBeNull();
  });
});
