import { Redis } from "ioredis";

export type TaskRunQueueMessage = {
  runId: string;
  taskId: string;
  environmentId: string;
};

export const TASK_RUN_QUEUE_KEY = "cascade:task-runs";
export const TASK_RUN_DELAYED_QUEUE_KEY = "cascade:task-run:delayed";

const globalForRedis = globalThis as unknown as {
  taskRunQueueRedis?: Redis;
};

type EngueueTaskRunOptions = {
  delayMs?: number;
};

function getQueueRedisUrl() {
  const redisUrl = process.env.QUEUE_REDIS_URL;

  if (!redisUrl) {
    throw new Error("QUEUE_REDIS_URL is missing");
  }

  return redisUrl;
}

function createRedisClient() {
  return new Redis(getQueueRedisUrl(), {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

export async function enqueueTaskRun(
  message: TaskRunQueueMessage,
  options: EngueueTaskRunOptions = {},
) {
  const delayMs = options.delayMs ?? 0;
  const rawMessage = JSON.stringify(message);

  if (delayMs <= 0) {
    await taskRunQueueRedis.rpush(TASK_RUN_QUEUE_KEY, rawMessage);
    return;
  }

  await taskRunQueueRedis.zadd(TASK_RUN_DELAYED_QUEUE_KEY, Date.now() + delayMs, rawMessage);
}

async function promoteDueTaskRunMessages() {
  const rawMessages = await taskRunQueueRedis.zrangebyscore(
    TASK_RUN_DELAYED_QUEUE_KEY,
    0,
    Date.now(),
    "LIMIT",
    0,
    100,
  );

  for (const rawMessage of rawMessages) {
    const removed = await taskRunQueueRedis.zrem(TASK_RUN_DELAYED_QUEUE_KEY, rawMessage);

    if (removed === 1) {
      await taskRunQueueRedis.rpush(TASK_RUN_QUEUE_KEY, rawMessage);
    }
  }
}

export const taskRunQueueRedis = globalForRedis.taskRunQueueRedis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.taskRunQueueRedis = taskRunQueueRedis;
}

export async function popTaskRunMessage() {
  await promoteDueTaskRunMessages();

  const result = await taskRunQueueRedis.blpop(TASK_RUN_QUEUE_KEY, 5);

  if (!result) {
    return null;
  }

  const [, rawMessage] = result;

  return JSON.parse(rawMessage) as TaskRunQueueMessage;
}
