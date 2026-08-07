import type { Redis } from "ioredis";

const acquireQueueConcurrencyLeaseLua = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])

local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[2]) then
	return 0
end

redis.call("ZADD", KEYS[1], ARGV[3], ARGV[4])
redis.call("PEXPIRE", KEYS[1], ARGV[5])

return 1
`;

const refreshQueueConcurrencyLeaseLua = `
if redis.call("ZSCORE", KEYS[1], ARGV[1]) then
	redis.call("ZADD", KEYS[1], ARGV[2], ARGV[1])
	redis.call("PEXPIRE", KEYS[1], ARGV[3])

	return 1
end

return 0
`;

const registeredClients = new WeakSet<Redis>();

type RedisWithQueueConcurrencyCommands = Redis & {
  acquireQueueConcurrencyLease(
    key: string,
    now: number,
    limit: number,
    expiresAt: number,
    token: string,
    ttlMs: number,
  ): Promise<unknown>;

  refreshQueueConcurrencyLease(
    key: string,
    token: string,
    expiresAt: number,
    ttlMs: number,
  ): Promise<unknown>;
};

type AcquireQueueConcurrencyLeaseInput = {
  key: string;
  now: number;
  limit: number;
  expiresAt: number;
  token: string;
  ttlMs: number;
};

type RefreshQueueConcurrencyLeaseInput = {
  key: string;
  token: string;
  expiresAt: number;
  ttlMs: number;
};

function registerQueueConcurrencyCommands(redis: Redis) {
  if (registeredClients.has(redis)) {
    return;
  }

  redis.defineCommand("acquireQueueConcurrencyLease", {
    numberOfKeys: 1,
    lua: acquireQueueConcurrencyLeaseLua,
  });

  redis.defineCommand("refreshQueueConcurrencyLease", {
    numberOfKeys: 1,
    lua: refreshQueueConcurrencyLeaseLua,
  });

  registeredClients.add(redis);
}

function getRedisCommands(redis: Redis) {
  registerQueueConcurrencyCommands(redis);

  return redis as RedisWithQueueConcurrencyCommands;
}

function toRedisInteger(value: unknown, commandName: string) {
  if (typeof value === "number") {
    return value;
  }

  throw new Error(`${commandName} returned ${typeof value}; expected Redis integer`);
}

export async function runAcquireQueueConcurrencyLeaseCommand(
  redis: Redis,
  input: AcquireQueueConcurrencyLeaseInput,
) {
  const result = await getRedisCommands(redis).acquireQueueConcurrencyLease(
    input.key,
    input.now,
    input.limit,
    input.expiresAt,
    input.token,
    input.ttlMs,
  );

  return toRedisInteger(result, "acquireQueueConcurrencyLease") === 1;
}

export async function runRefreshQueueConcurrencyLeaseCommand(
  redis: Redis,
  input: RefreshQueueConcurrencyLeaseInput,
) {
  const result = await getRedisCommands(redis).refreshQueueConcurrencyLease(
    input.key,
    input.token,
    input.expiresAt,
    input.ttlMs,
  );

  return toRedisInteger(result, "refreshQueueConcurrencyLease") === 1;
}
