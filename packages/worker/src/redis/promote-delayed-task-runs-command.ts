import type { Redis } from "ioredis";

const promoteDelayedTaskRunsLua = `
local delayedQueueKey = KEYS[1]
local queueKey = KEYS[2]

local now = ARGV[1]
local limit = tonumber(ARGV[2])

local messages = redis.call(
    "ZRANGEBYSCORE",
    delayedQueueKey,
    "-inf",
    now,
    "LIMIT",
    0,
    limit
)

for _, message in ipairs(messages) do
    redis.call("ZREM", delayedQueueKey, message)
    redis.call("RPUSH", queueKey, message)
end

return #messages
`;

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
