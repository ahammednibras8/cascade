import { Redis } from "ioredis";

export type TaskRunQueueMessage = {
  runId: string;
  taskId: string;
  environmentId: string;
};

const TASK_RUN_QUEUE_KEY = "cascade:task-runs";
const TASK_RUN_DELAYED_QUEUE_KEY = "cascade:task-run:delayed";

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

type EnqueueTaskRunOptions = {
  delayMs?: number;
};

export async function enqueueTaskRun(
  message: TaskRunQueueMessage,
  options: EnqueueTaskRunOptions = {},
) {
  const delayMs = options.delayMs ?? 0;
  const rawMessage = JSON.stringify(message);

  if (delayMs <= 0) {
    await taskRunQueueRedis.rpush(TASK_RUN_QUEUE_KEY, rawMessage);
    return;
  }

  await taskRunQueueRedis.zadd(TASK_RUN_DELAYED_QUEUE_KEY, Date.now() + delayMs, rawMessage);
}

export { TASK_RUN_QUEUE_KEY };
