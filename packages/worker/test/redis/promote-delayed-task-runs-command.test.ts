import type { Redis } from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runPromoteDelayedTaskRunsCommand } =
  await import("../../src/redis/promote-delayed-task-runs-command.js");

type RedisStub = {
  defineCommand: ReturnType<
    typeof vi.fn<(name: string, options: { numberOfKeys: number; lua: string }) => void>
  >;
  promoteDelayedTaskRuns: ReturnType<
    typeof vi.fn<
      (delayedQueueKey: string, queueKey: string, now: number, limit: number) => Promise<unknown>
    >
  >;
};

function createRedisStub(result: unknown): RedisStub {
  return {
    defineCommand: vi.fn<(name: string, options: { numberOfKeys: number; lua: string }) => void>(),
    promoteDelayedTaskRuns: vi
      .fn<
        (delayedQueueKey: string, queueKey: string, now: number, limit: number) => Promise<unknown>
      >()
      .mockResolvedValue(result),
  };
}

function asRedis(redis: RedisStub) {
  return redis as unknown as Redis;
}

describe("runPromoteDelayedTaskRunsCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers and executes the Lua command with two Redis keys", async () => {
    const redis = createRedisStub(3);

    const promotedCount = await runPromoteDelayedTaskRunsCommand(asRedis(redis), {
      delayedQueueKey: "cascade:task-run:delayed:local",
      queueKey: "cascade:task-runs:local",
      now: 1_000,
      limit: 100,
    });

    expect(promotedCount).toBe(3);

    expect(redis.defineCommand).toHaveBeenCalledWith(
      "promoteDelayedTaskRuns",
      expect.objectContaining({
        numberOfKeys: 2,
        lua: expect.stringContaining("ZRANGEBYSCORE"),
      }),
    );

    expect(redis.promoteDelayedTaskRuns).toHaveBeenCalledWith(
      "cascade:task-run:delayed:local",
      "cascade:task-runs:local",
      1_000,
      100,
    );
  });

  it("registers the Lua command once per Redis client", async () => {
    const redis = createRedisStub(1);

    await runPromoteDelayedTaskRunsCommand(asRedis(redis), {
      delayedQueueKey: "delayed",
      queueKey: "queue",
      now: 1,
      limit: 10,
    });

    await runPromoteDelayedTaskRunsCommand(asRedis(redis), {
      delayedQueueKey: "delayed",
      queueKey: "queue",
      now: 2,
      limit: 10,
    });

    expect(redis.defineCommand).toHaveBeenCalledOnce();
    expect(redis.promoteDelayedTaskRuns).toHaveBeenCalledTimes(2);
  });

  it("throws when Redis does not return an integer", async () => {
    const redis = createRedisStub("1");

    await expect(
      runPromoteDelayedTaskRunsCommand(asRedis(redis), {
        delayedQueueKey: "delayed",
        queueKey: "queue",
        now: 1,
        limit: 10,
      }),
    ).rejects.toThrow("promoteDelayedTaskRuns returned string; expected Redis Integer");
  });
});
