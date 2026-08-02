import {
  createChildTraceContext,
  createRootTraceContext,
  parseTaskExecutionConfig,
  toTraceparent,
  type TaskDefinition,
  type TaskExecutionConfig,
  type TraceContext,
} from "@cascade/core";
import { releaseQueueConcurrency, type QueueConcurrencyLease } from "./queue/concurrency-limits.js";
import { enqueueTaskRun, type TaskRunQueueMessage } from "./queue/task-runs.js";
import { acquireTaskRunConcurrency } from "./task-run-processing/concurrency.js";
import {
  failTaskRunForMissingLocalTask,
  failTaskRunPermanently,
} from "./task-run-processing/results.js";
import { runClaimedTask } from "./task-run-processing/runner.js";
import {
  claimTaskRunForExecution,
  loadTaskRunForProcessing,
  type ProcessableTaskRun,
} from "./task-run-processing/state.js";
import { startQueueConcurrencyLeaseHeartbeat } from "./timers/queue-concurrency-lease.js";
import type { LoadedTaskRegistry } from "./tasks/load-registry.js";
import { withRemoteParentSpan } from "@cascade/telemetry";

function getExecutionTrace(taskRun: ProcessableTaskRun) {
  return taskRun.traceId
    ? createChildTraceContext({
        traceId: taskRun.traceId,
        parentSpanId: taskRun.triggerSpanId,
      })
    : createRootTraceContext();
}

function getStoredTriggerTrace(taskRun: ProcessableTaskRun): TraceContext | null {
  if (!taskRun.traceId || !taskRun.triggerSpanId) {
    return null;
  }

  return {
    traceId: taskRun.traceId,
    spanId: taskRun.triggerSpanId,
    parentSpanId: null,
    traceFlags: "01",
    traceparent: toTraceparent({
      traceId: taskRun.traceId,
      spanId: taskRun.triggerSpanId,
    }),
  };
}

async function requeueDelayedTaskRun(message: TaskRunQueueMessage, delayUntil: Date) {
  await enqueueTaskRun(message, {
    delayMs: delayUntil.getTime() - Date.now(),
  });
}

async function processLoadedTaskRun(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  taskRegistry: LoadedTaskRegistry;
  trace: TraceContext;
}) {
  const executionConfig = parseTaskExecutionConfig(input.taskRun.executionConfig);

  if (!executionConfig) {
    const attempt = await claimTaskRunForExecution({
      taskRun: input.taskRun,
      trace: input.trace,
    });

    if (!attempt) {
      return;
    }

    await failTaskRunPermanently({
      taskRunId: input.taskRun.id,
      attempt,
      trace: input.trace,
      error: {
        code: "EXECUTION_CONFIG_MISSING",
        message: "Task run has no valid execution configuration snapshot",
      },
    });

    return;
  }

  const localTask = input.taskRegistry.get(input.taskRun.task.slug);
  const concurrency = await acquireTaskRunConcurrency({
    message: input.message,
    taskRun: input.taskRun,
    executionConfig,
  });

  if (concurrency.status === "deferred") {
    return;
  }

  await processTaskRunWithLease({
    message: input.message,
    taskRun: input.taskRun,
    localTask,
    executionConfig,
    trace: input.trace,
    concurrencyLease: concurrency.lease,
  });
}

export async function processTaskRun(
  message: TaskRunQueueMessage,
  taskRegistry: LoadedTaskRegistry,
) {
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

  const fallbackTrace = getExecutionTrace(taskRun);
  const storedTriggerTrace = getStoredTriggerTrace(taskRun);

  if (!storedTriggerTrace) {
    await processLoadedTaskRun({
      message,
      taskRun,
      taskRegistry,
      trace: fallbackTrace,
    });
    return;
  }

  await withRemoteParentSpan(
    {
      name: "cascade.task.run.execute",
      parent: storedTriggerTrace,
      attributes: {
        "cascade.task_run.id": taskRun.id,
        "cascade.task.id": taskRun.taskId,
        "cascade.task.slug": taskRun.task.slug,
      },
    },
    async (otelTrace) =>
      processLoadedTaskRun({
        message,
        taskRun,
        taskRegistry,
        trace: otelTrace ?? fallbackTrace,
      }),
  );
}

async function processTaskRunWithLease(input: {
  message: TaskRunQueueMessage;
  taskRun: ProcessableTaskRun;
  localTask: TaskDefinition | undefined;
  executionConfig: TaskExecutionConfig;
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
        executionConfig: input.executionConfig,
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
