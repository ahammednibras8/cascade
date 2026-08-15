import { randomUUID } from "node:crypto";
import { taskRunQueueRedis } from "./task-runs.js";
import {
  runAcquireQueueConcurrencyLeaseCommand,
  runRefreshQueueConcurrencyLeaseCommand,
} from "../redis/queue-concurrency-commands.js";

const QUEUE_CONCURRENCY_LOCK_TTL_MS = 60_000;

export type QueueConcurrencyLease = {
  key: string;
  token: string;
  ttlMs: number;
};

type TryAcquireQueueConcurrencyInput = {
  environmentId: string;
  queueName: string;
  runId: string;
  limit: number;
};

function getQueueConcurrencyKey(input: { environmentId: string; queueName: string }) {
  return `cascade:queue-concurrency:${input.environmentId}:${input.queueName}`;
}

export async function tryAcquireQueueConcurrency(
  input: TryAcquireQueueConcurrencyInput,
): Promise<QueueConcurrencyLease | null> {
  const now = Date.now();
  const expiresAt = now + QUEUE_CONCURRENCY_LOCK_TTL_MS;
  const key = getQueueConcurrencyKey(input);
  const token = `${input.runId}:${randomUUID()}`;

  const acquired = await runAcquireQueueConcurrencyLeaseCommand(taskRunQueueRedis, {
    key,
    now,
    limit: input.limit,
    expiresAt,
    token,
    ttlMs: QUEUE_CONCURRENCY_LOCK_TTL_MS,
  });

  if (!acquired) {
    return null;
  }

  return {
    key,
    token,
    ttlMs: QUEUE_CONCURRENCY_LOCK_TTL_MS,
  };
}

export async function refreshQueueConcurrencyLease(lease: QueueConcurrencyLease) {
  const expiresAt = Date.now() + lease.ttlMs;

  return runRefreshQueueConcurrencyLeaseCommand(taskRunQueueRedis, {
    key: lease.key,
    token: lease.token,
    expiresAt,
    ttlMs: lease.ttlMs,
  });
}

export async function releaseQueueConcurrency(lease: QueueConcurrencyLease) {
  await taskRunQueueRedis.zrem(lease.key, lease.token);
}
