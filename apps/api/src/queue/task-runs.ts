import { Redis } from "ioredis";

export type TaskRunQueueMessage = {
  runId: string;
  taskId: string;
  environmentId: string;
  deploymentId: string | null;
};

const TASK_RUN_QUEUE_KEY_PREFIX = "cascade:task-runs";
const TASK_RUN_DELAYED_QUEUE_KEY_PREFIX = "cascade:task-run:delayed";

const globalForRedis = globalThis as unknown as {
  taskRunQueueRedis?: Redis;
};

type EnqueueTaskRunOptions = {
  delayMs?: number;
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

function getDeploymentQueuePart(deploymentId: string | null | undefined) {
  if (!deploymentId) {
    return "local";
  }

  return deploymentId;
}

function getTaskRunQueueKey(deploymentId: string | null | undefined) {
  return `${TASK_RUN_QUEUE_KEY_PREFIX}:${getDeploymentQueuePart(deploymentId)}`;
}

function getTaskRunDelayedQueueKey(deploymentId: string | null | undefined) {
  return `${TASK_RUN_DELAYED_QUEUE_KEY_PREFIX}:${getDeploymentQueuePart(deploymentId)}`;
}

export const taskRunQueueRedis = globalForRedis.taskRunQueueRedis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.taskRunQueueRedis = taskRunQueueRedis;
}

export async function enqueueTaskRun(
  message: TaskRunQueueMessage,
  options: EnqueueTaskRunOptions = {},
) {
  const delayMs = options.delayMs ?? 0;
  const rawMessage = JSON.stringify(message);

  if (delayMs <= 0) {
    await taskRunQueueRedis.rpush(getTaskRunQueueKey(message.deploymentId), rawMessage);
    return;
  }

  await taskRunQueueRedis.zadd(
    getTaskRunDelayedQueueKey(message.deploymentId),
    Date.now() + delayMs,
    rawMessage,
  );
}
