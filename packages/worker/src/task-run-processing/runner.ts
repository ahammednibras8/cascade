import type { JsonValue, TaskDefinition, TaskExecutionConfig, TraceContext } from "@cascade/core";
import { Prisma } from "@cascade/database";
import { maybeStoreJsonValue, resolveJsonValue } from "@cascade/storage";
import { enqueueTaskRun, type TaskRunQueueMessage } from "../queue/task-runs.js";
import { getRetryDelayMs } from "../retry.js";
import { isTaskRunCanceled, startTaskRunCancellationWatcher } from "../task-run-cancellation.js";
import { createTaskLogger } from "../task-run-logger.js";
import { runWithTaskTimeout } from "../task-timeout.js";
import { startTaskRunHeartbeat } from "../timers/task-run-heartbeat.js";
import { serializeTaskRunError } from "./errors.js";
import { completeTaskRun, failTaskRunPermanently, scheduleTaskRunRetry } from "./results.js";
import type { ProcessableTaskRun, TaskRunAttempt } from "./state.js";
import { recordTaskRunExecution } from "@cascade/telemetry";

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
    taskId: input.taskRun.taskId,
    runId: input.taskRun.id,
    value: input.output,
  })) as Prisma.InputJsonValue;
}

async function executeLocalTask(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  attempt: TaskRunAttempt;
  localTask: TaskDefinition;
  executionConfig: TaskExecutionConfig;
  trace: TraceContext;
  cancellationSignal: AbortSignal;
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
    timeoutMs: input.executionConfig.timeoutMs,
    signal: input.cancellationSignal,
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
  executionConfig: TaskExecutionConfig;
  trace: TraceContext;
  error: unknown;
  cancellationSignal: AbortSignal;
  executionStartedAtMs: number;
}) {
  if (input.cancellationSignal.aborted || (await isTaskRunCanceled(input.taskRun.id))) {
    return;
  }

  const serializedError = serializeTaskRunError(input.error);
  const shouldRetry = input.attempt.attemptNumber < input.executionConfig.retry.maxAttempts;
  const retryDelayMs = shouldRetry
    ? getRetryDelayMs(input.attempt.attemptNumber, input.executionConfig.retry)
    : 0;

  if (!shouldRetry) {
    const failed = await failTaskRunPermanently({
      taskRunId: input.taskRun.id,
      attempt: input.attempt,
      trace: input.trace,
      error: serializedError,
    });

    if (failed) {
      recordTaskRunExecution({
        outcome: "failed",
        durationMs: performance.now() - input.executionStartedAtMs,
      });
    }
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
    maxAttempts: input.executionConfig.retry.maxAttempts,
  });

  if (!retried) {
    return;
  }

  recordTaskRunExecution({
    outcome: "retried",
    durationMs: performance.now() - input.executionStartedAtMs,
  });

  await enqueueTaskRun(input.message, {
    delayMs: retryDelayMs,
  });
}

export async function runClaimedTask(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  attempt: TaskRunAttempt;
  localTask: TaskDefinition;
  executionConfig: TaskExecutionConfig;
  trace: TraceContext;
}) {
  process.stdout.write(`Running task ${input.taskRun.task.slug} (${input.taskRun.id})\n`);

  const cancellationController = new AbortController();
  const stopCancellationWatcher = await startTaskRunCancellationWatcher({
    taskRunId: input.taskRun.id,
    abortController: cancellationController,
  });

  try {
    if (cancellationController.signal.aborted) {
      return;
    }

    const executionStartedAtMs = performance.now();

    const stopHeartbeat = startTaskRunHeartbeat(input.taskRun.id);

    try {
      const output = await executeLocalTask({
        ...input,
        cancellationSignal: cancellationController.signal,
      });

      if (cancellationController.signal.aborted || (await isTaskRunCanceled(input.taskRun.id))) {
        return;
      }

      const storedOutput = await storeTaskOutput({
        output,
        message: input.message,
        taskRun: input.taskRun,
      });

      if (cancellationController.signal.aborted || (await isTaskRunCanceled(input.taskRun.id))) {
        return;
      }

      const completed = await completeTaskRun({
        taskRunId: input.taskRun.id,
        attemptId: input.attempt.id,
        trace: input.trace,
        output: storedOutput,
        localTaskId: input.localTask.id,
      });

      if (completed) {
        recordTaskRunExecution({
          outcome: "completed",
          durationMs: performance.now() - executionStartedAtMs,
        });
      }
    } catch (error) {
      await handleTaskFailure({
        ...input,
        error,
        cancellationSignal: cancellationController.signal,
        executionStartedAtMs,
      });
    } finally {
      stopHeartbeat();
    }
  } finally {
    stopCancellationWatcher();
  }
}
