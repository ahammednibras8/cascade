import {
  createChildTraceContext,
  createRootTraceContext,
  type JsonValue,
  type TaskDefinition,
  type TraceContext,
} from "@cascade/core";
import { Prisma } from "@cascade/database";
import { maybeStoreJsonValue, resolveJsonValue } from "@cascade/storage";
import { releaseQueueConcurrency, type QueueConcurrencyLease } from "./queue/concurrency-limits.js";
import { enqueueTaskRun, type TaskRunQueueMessage } from "./queue/task-runs.js";
import { getRetryDelayMs } from "./retry.js";
import { acquireTaskRunConcurrency } from "./task-run-processing/concurrency.js";
import { serializeTaskRunError } from "./task-run-processing/errors.js";
import {
  completeTaskRun,
  failTaskRunForMissingLocalTask,
  failTaskRunPermanently,
  scheduleTaskRunRetry,
} from "./task-run-processing/results.js";
import {
  claimTaskRunForExecution,
  loadTaskRunForProcessing,
  type ProcessableTaskRun,
  type TaskRunAttempt,
} from "./task-run-processing/state.js";
import { createTaskLogger } from "./task-run-logger.js";
import { runWithTaskTimeout } from "./task-timeout.js";
import { taskRegistry } from "./tasks/registry.js";
import { startQueueConcurrencyLeaseHeartbeat } from "./timers/queue-concurrency-lease.js";
import { startTaskRunHeartbeat } from "./timers/task-run-heartbeat.js";

function getExecutionTrace(taskRun: ProcessableTaskRun) {
  return taskRun.traceId
    ? createChildTraceContext({
        traceId: taskRun.traceId,
        parentSpanId: taskRun.triggerSpanId,
      })
    : createRootTraceContext();
}

async function requeueDelayedTaskRun(message: TaskRunQueueMessage, delayUntil: Date) {
  await enqueueTaskRun(message, {
    delayMs: delayUntil.getTime() - Date.now(),
  });
}

async function storeTaskOutput(input: {
  output: JsonValue | void;
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
}) {
  if (input.output === undefined) {
    return Prisma.DbNull;
  }

  return (await maybeStoreJsonValue({
    kind: "OUTPUT",
    environmentId: input.message.environmentId,
    taskId: input.taskRun.id,
    runId: input.taskRun.id,
    value: input.output,
  })) as Prisma.InputJsonValue;
}

async function executeLocalTask(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  attempt: TaskRunAttempt;
  localTask: TaskDefinition;
  trace: TraceContext;
}) {
  const logger = createTaskLogger({
    taskRunId: input.taskRun.id,
    taskAttemptId: input.attempt.id,
    traceId: input.trace.traceId,
    spanId: input.trace.spanId,
    parentSpanId: input.trace.parentSpanId,
  });

  const payload = await resolveJsonValue(input.taskRun.payload);

  return runWithTaskTimeout({
    timeoutMs: input.localTask.timeoutMs,
    run: (signal) =>
      input.localTask.run({
        runId: input.taskRun.id,
        taskId: input.taskRun.taskId,
        environmentId: input.message.environmentId,
        payload: payload as JsonValue | null,
        logger,
        signal,
        trace: input.trace,
      }),
  });
}

async function handleTaskFailure(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  attempt: TaskRunAttempt;
  localTask: TaskDefinition;
  trace: TraceContext;
  error: unknown;
}) {
  const serializedError = serializeTaskRunError(input.error);
  const shouldRetry = input.attempt.attemptNumber < input.localTask.retry.maxAttempts;
  const retryDelayMs = shouldRetry
    ? getRetryDelayMs(input.attempt.attemptNumber, input.localTask.retry)
    : 0;

  if (!shouldRetry) {
    await failTaskRunPermanently({
      taskRunId: input.taskRun.id,
      attempt: input.attempt,
      trace: input.trace,
      error: serializedError,
    });
    return;
  }

  const retryAt = new Date(Date.now() + retryDelayMs);
  const retried = await scheduleTaskRunRetry({
    taskRunId: input.taskRun.id,
    attempt: input.attempt,
    trace: input.trace,
    error: serializedError,
    retryAt,
    retryDelayMs,
    maxAttempts: input.localTask.retry.maxAttempts,
  });

  if (!retried) {
    return;
  }

  await enqueueTaskRun(input.message, {
    delayMs: retryDelayMs,
  });
}

async function runClaimedTask(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  attempt: TaskRunAttempt;
  localTask: TaskDefinition;
  trace: TraceContext;
}) {
  process.stdout.write(`Running task ${input.taskRun.task.slug} (${input.taskRun.id})\n`);

  const stopHeartbeat = startTaskRunHeartbeat(input.taskRun.id);

  try {
    const output = await executeLocalTask(input);
    const storedOutput = await storeTaskOutput({
      output,
      message: input.message,
      taskRun: input.taskRun,
    });

    await completeTaskRun({
      taskRunId: input.taskRun.id,
      attemptId: input.attempt.id,
      trace: input.trace,
      output: storedOutput,
      localTaskId: input.localTask.id,
    });
  } catch (error) {
    await handleTaskFailure({
      ...input,
      error,
    });
  } finally {
    stopHeartbeat();
  }
}

export async function processTaskRun(message: TaskRunQueueMessage) {
  const taskRun = await loadTaskRunForProcessing(message);

  if (!taskRun) {
    process.stderr.write(`TaskRun not found: ${message.runId}\n`);
    return;
  }

  if (taskRun.status !== "PENDING") {
    return;
  }

  if (taskRun.delayUntil && taskRun.delayUntil > new Date()) {
    await requeueDelayedTaskRun(message, taskRun.delayUntil);
    return;
  }

  const localTask = taskRegistry.get(taskRun.task.slug);
  const trace = getExecutionTrace(taskRun);
  const concurrency = await acquireTaskRunConcurrency({
    message,
    taskRun,
    localTask,
  });

  if (concurrency.status === "deferred") {
    return;
  }

  await processTaskRunWithLease({
    message,
    taskRun,
    localTask,
    trace,
    concurrencyLease: concurrency.lease,
  });
}

async function processTaskRunWithLease(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  localTask: TaskDefinition | undefined;
  trace: TraceContext;
  concurrencyLease: QueueConcurrencyLease | null;
}) {
  try {
    const attempt = await claimTaskRunForExecution({
      taskRun: input.taskRun,
      trace: input.trace,
    });

    if (!attempt) {
      process.stderr.write(`TaskRun ${input.taskRun.id} was already claimed; skipping\n`);
      return;
    }

    if (!input.localTask) {
      await failTaskRunForMissingLocalTask({
        taskRun: input.taskRun,
        attempt,
        trace: input.trace,
      });
      return;
    }

    const stopQueueConcurrencyHeartbeat = input.concurrencyLease
      ? startQueueConcurrencyLeaseHeartbeat(input.concurrencyLease)
      : () => {};

    try {
      await runClaimedTask({
        message: input.message,
        taskRun: input.taskRun,
        attempt,
        localTask: input.localTask,
        trace: input.trace,
      });
    } finally {
      stopQueueConcurrencyHeartbeat();
    }
  } finally {
    if (input.concurrencyLease) {
      await releaseQueueConcurrency(input.concurrencyLease);
    }
  }
}
