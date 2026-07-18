import { Redis } from "ioredis";

export type TaskRunQueueMessage = {
  runId: string;
  taskId: string;
  environmentId: string;
};

export const TASK_RUN_QUEUE_KEY = "cascade:task-runs";

const globalForRedis = globalThis as unknown as {
  taskRunQueueRedis?: Redis;
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

export const taskRunQueueRedis = globalForRedis.taskRunQueueRedis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.taskRunQueueRedis = taskRunQueueRedis;
}

export async function popTaskRunMessage() {
  const result = await taskRunQueueRedis.blpop(TASK_RUN_QUEUE_KEY, 5);

  if (!result) {
    return null;
  }

  const [, rawMessage] = result;

  return JSON.parse(rawMessage) as TaskRunQueueMessage;
}
