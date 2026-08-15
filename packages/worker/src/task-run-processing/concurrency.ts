import type { TaskExecutionConfig } from "@cascade/core";
import { QUEUE_CONCURRENCY_RETRY_MS } from "../config.js";
import {
  tryAcquireQueueConcurrency,
  type QueueConcurrencyLease,
} from "../queue/concurrency-limits.js";
import { enqueueTaskRun, type TaskRunQueueMessage } from "../queue/task-runs.js";
import { deferTaskRun, type ProcessableTaskRun } from "./state.js";

type ConcurrencyResult =
  | {
      status: "not-required";
      lease: null;
    }
  | {
      status: "acquired";
      lease: QueueConcurrencyLease;
    }
  | {
      status: "deferred";
      lease: null;
    };

export async function acquireTaskRunConcurrency(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  executionConfig: TaskExecutionConfig;
}): Promise<ConcurrencyResult> {
  const concurrencyLimit = input.executionConfig.queue.concurrencyLimit;

  if (concurrencyLimit === null) {
    return {
      status: "not-required",
      lease: null,
    };
  }

  const lease = await tryAcquireQueueConcurrency({
    environmentId: input.message.environmentId,
    queueName: input.executionConfig.queue.name,
    runId: input.taskRun.id,
    limit: concurrencyLimit,
  });

  if (lease) {
    return {
      status: "acquired",
      lease,
    };
  }

  const retryAt = new Date(Date.now() + QUEUE_CONCURRENCY_RETRY_MS);

  await deferTaskRun({
    taskRunId: input.taskRun.id,
    retryAt,
  });

  await enqueueTaskRun(input.message, {
    delayMs: QUEUE_CONCURRENCY_RETRY_MS,
  });

  return {
    status: "deferred",
    lease: null,
  };
}
