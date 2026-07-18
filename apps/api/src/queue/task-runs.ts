import { Redis } from "ioredis";

export type TaskRunQueueMessage = {
  runId: string;
  taskId: string;
  environmentId: string;
};

const TASK_RUN_QUEUE_KEY = "cascade:task-runs";

const globalForRedis = globalThis as unknown as {
  taskRunQueueRedis?: Redis;
};

function getQueueRedisUrl() {
  const redisUrl = process.env.QUEUE_REDIS_URL;

  if (!redisUrl) {
    throw new Error("QUEUE_REDIS_URL is required");
  }

  return redisUrl;
}

function createRedisClient() {
  return new Redis(getQueueRedisUrl(), {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
}

export const taskRunQueueRedis = globalForRedis.taskRunQueueRedis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.taskRunQueueRedis = taskRunQueueRedis;
}

export async function enqueueTaskRun(message: TaskRunQueueMessage) {
  await taskRunQueueRedis.rpush(TASK_RUN_QUEUE_KEY, JSON.stringify(message));
}

export { TASK_RUN_QUEUE_KEY };
