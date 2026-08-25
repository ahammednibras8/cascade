import { Redis } from "ioredis";
import { runPromoteDelayedTaskRunsCommand } from "../redis/promote-delayed-task-runs-command.js";

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
  const redisUrl = process.env["QUEUE_REDIS_URL"];

  if (!redisUrl) {
    throw new Error("QUEUE_REDIS_URL is missing");
  }

  return redisUrl;
}

function createRedisClient() {
  const redis = new Redis(getQueueRedisUrl(), {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  redis.on("error", () => {});

  return redis;
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

function getWorkerDeploymentId() {
  const rawDeploymentId = process.env["CASCADE_DEPLOYMENT_ID"]?.trim();

  if (!rawDeploymentId || rawDeploymentId === "local") {
    return null;
  }

  return rawDeploymentId;
}

export const taskRunQueueRedis = globalForRedis.taskRunQueueRedis ?? createRedisClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForRedis.taskRunQueueRedis = taskRunQueueRedis;
}

export function disconnectTaskRunQueueRedis() {
  taskRunQueueRedis.disconnect();
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

async function promoteDueTaskRunMessages(deploymentId: string | null) {
  return runPromoteDelayedTaskRunsCommand(taskRunQueueRedis, {
    delayedQueueKey: getTaskRunDelayedQueueKey(deploymentId),
    queueKey: getTaskRunQueueKey(deploymentId),
    now: Date.now(),
    limit: 100,
  });
}

export async function popTaskRunMessage() {
  const deploymentId = getWorkerDeploymentId();

  await promoteDueTaskRunMessages(deploymentId);

  const result = await taskRunQueueRedis.blpop(getTaskRunQueueKey(deploymentId), 5);

  if (!result) {
    return null;
  }

  const [, rawMessage] = result;

  return JSON.parse(rawMessage) as TaskRunQueueMessage;
}
