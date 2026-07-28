import type { Redis } from "ioredis";
import { readFileSync } from "node:fs";

const promoteDelayedTaskRunsLua = readFileSync(
  new URL("./lua/promote-delayed-task-runs.lua", import.meta.url),
  "utf-8",
);

const registeredClients = new WeakSet<Redis>();

type RedisWithPromoteDelayedTaskRunsCommand = Redis & {
  promoteDelayedTaskRuns(
    delayedQueueKey: string,
    queueKey: string,
    now: number,
    limit: number,
  ): Promise<unknown>;
};

type PromoteDelayedTaskRunsInput = {
  delayedQueueKey: string;
  queueKey: string;
  now: number;
  limit: number;
};

function registerPromoteDelayedTaskRunsCommand(redis: Redis) {
  if (registeredClients.has(redis)) {
    return;
  }

  redis.defineCommand("promoteDelayedTaskRuns", {
    numberOfKeys: 2,
    lua: promoteDelayedTaskRunsLua,
  });

  registeredClients.add(redis);
}

function getRedisCommands(redis: Redis) {
  registerPromoteDelayedTaskRunsCommand(redis);

  return redis as RedisWithPromoteDelayedTaskRunsCommand;
}

export async function runPromoteDelayedTaskRunsCommand(
  redis: Redis,
  input: PromoteDelayedTaskRunsInput,
) {
  const result = await getRedisCommands(redis).promoteDelayedTaskRuns(
    input.delayedQueueKey,
    input.queueKey,
    input.now,
    input.limit,
  );

  if (typeof result !== "number") {
    throw new Error(`promoteDelayedTaskRuns returned ${typeof result}; expected Redis Integer`);
  }

  return result;
}
