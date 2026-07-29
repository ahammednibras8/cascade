import {
  createChildTraceContext,
  createRootTraceContext,
  parseTaskExecutionConfig,
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
import { taskRegistry } from "./tasks/registry.js";
import { startQueueConcurrencyLeaseHeartbeat } from "./timers/queue-concurrency-lease.js";

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

  const executionConfig = parseTaskExecutionConfig(taskRun.executionConfig);
  const trace = getExecutionTrace(taskRun);

  if (!executionConfig) {
    const attempt = await claimTaskRunForExecution({
      taskRun,
      trace,
    });

    if (!attempt) {
      return;
    }

    await failTaskRunPermanently({
      taskRunId: taskRun.id,
      attempt,
      trace,
      error: {
        code: "EXECUTION_CONFIG_MISSING",
        message: "Task run has no valid execution configuration snapshot",
      },
    });

    return;
  }

  const localTask = taskRegistry.get(taskRun.task.slug);
  const concurrency = await acquireTaskRunConcurrency({
    message,
    taskRun,
    executionConfig,
  });

  if (concurrency.status === "deferred") {
    return;
  }

  await processTaskRunWithLease({
    message,
    taskRun,
    localTask,
    executionConfig,
    trace,
    concurrencyLease: concurrency.lease,
  });
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
