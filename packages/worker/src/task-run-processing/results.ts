import { packageName, type TraceContext } from "@cascade/core";
import { createTaskRunEvent, Prisma, prisma } from "@cascade/database";
import type { ProcessableTaskRun, TaskRunAttempt } from "./state.js";

type NullableJsonValue = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

export async function failTaskRunForMissingLocalTask(input: {
  taskRun: ProcessableTaskRun;
  attempt: TaskRunAttempt;
  trace: TraceContext;
}) {
  await prisma.$transaction(async (tx) => {
    const completedAt = new Date();
    const error = {
      code: "TASK_NOT_REGISTERED",
      message: `No local task registered for slug: ${input.taskRun.task.slug}`,
    };

    const updateRun = await tx.taskRun.updateMany({
      where: {
        id: input.taskRun.id,
        status: "EXECUTING",
      },
      data: {
        status: "FAILED",
        output: Prisma.DbNull,
        error,
        lastHeartbeatAt: completedAt,
        completedAt,
      },
    });

    if (updateRun.count !== 1) {
      return;
    }

    await markAttemptFailed(tx, {
      attemptId: input.attempt.id,
      error,
      completedAt,
    });

    await createTaskRunEvent(tx, {
      taskRunId: input.taskRun.id,
      taskAttemptId: input.attempt.id,
      type: "task.run.failed",
      level: "ERROR",
      message: "No local task registered for slug",
      traceId: input.trace.traceId,
      spanId: input.trace.spanId,
      parentSpanId: input.trace.parentSpanId,
      data: {
        taskSlug: input.taskRun.task.slug,
      },
    });
  });
}

export async function completeTaskRun(input: {
  taskRunId: string;
  attemptId: string;
  trace: TraceContext;
  output: NullableJsonValue;
  localTaskId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const completedAt = new Date();

    const updateRun = await tx.taskRun.updateMany({
      where: {
        id: input.taskRunId,
        status: "EXECUTING",
      },
      data: {
        status: "COMPLETED",
        output: input.output,
        error: Prisma.DbNull,
        lastHeartbeatAt: completedAt,
        completedAt,
      },
    });

    if (updateRun.count !== 1) {
      return false;
    }

    await tx.taskAttempt.update({
      where: {
        id: input.attemptId,
      },
      data: {
        status: "COMPLETED",
        completedAt,
      },
    });

    await createTaskRunEvent(tx, {
      taskRunId: input.taskRunId,
      taskAttemptId: input.attemptId,
      type: "task.run.completed",
      level: "INFO",
      message: "Task run completed successfully",
      traceId: input.trace.traceId,
      spanId: input.trace.spanId,
      parentSpanId: input.trace.parentSpanId,
      data: {
        worker: packageName,
        taskId: input.localTaskId,
      },
    });

    return true;
  });
}

export async function scheduleTaskRunRetry(input: {
  taskRunId: string;
  attempt: TaskRunAttempt;
  trace: TraceContext;
  error: Prisma.InputJsonValue;
  retryAt: Date;
  retryDelayMs: number;
  maxAttempts: number;
}) {
  return prisma.$transaction(async (tx) => {
    const failedAt = new Date();

    const updateRun = await tx.taskRun.updateMany({
      where: {
        id: input.taskRunId,
        status: "EXECUTING",
      },
      data: {
        status: "PENDING",
        delayUntil: input.retryAt,
        output: Prisma.DbNull,
        error: input.error,
        lastHeartbeatAt: null,
        completedAt: null,
      },
    });

    if (updateRun.count !== 1) {
      return false;
    }

    await markAttemptFailed(tx, {
      attemptId: input.attempt.id,
      error: input.error,
      completedAt: failedAt,
    });

    await createTaskRunEvent(tx, {
      taskRunId: input.taskRunId,
      taskAttemptId: input.attempt.id,
      type: "task.run.retry.scheduled",
      level: "WARN",
      message: "Task run failed and retry was scheduled",
      traceId: input.trace.traceId,
      spanId: input.trace.spanId,
      parentSpanId: input.trace.parentSpanId,
      data: {
        attemptNumber: input.attempt.attemptNumber,
        nextAttemptNumber: input.attempt.attemptNumber + 1,
        maxAttempts: input.maxAttempts,
        delayMs: input.retryDelayMs,
        error: input.error,
      },
    });

    return true;
  });
}

export async function failTaskRunPermanently(input: {
  taskRunId: string;
  attempt: TaskRunAttempt;
  trace: TraceContext;
  error: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    const completedAt = new Date();

    const updateRun = await tx.taskRun.updateMany({
      where: {
        id: input.taskRunId,
        status: "EXECUTING",
      },
      data: {
        status: "FAILED",
        output: Prisma.DbNull,
        error: input.error,
        lastHeartbeatAt: completedAt,
        completedAt,
      },
    });

    if (updateRun.count !== 1) {
      return false;
    }

    await markAttemptFailed(tx, {
      attemptId: input.attempt.id,
      error: input.error,
      completedAt,
    });

    await createTaskRunEvent(tx, {
      taskRunId: input.taskRunId,
      taskAttemptId: input.attempt.id,
      type: "task.run.failed",
      level: "ERROR",
      message: "Task run failed",
      traceId: input.trace.traceId,
      spanId: input.trace.spanId,
      parentSpanId: input.trace.parentSpanId,
      data: input.error,
    });

    return true;
  });
}

type AttemptUpdateClient = {
  taskAttempt: Pick<typeof prisma.taskAttempt, "update">;
};

async function markAttemptFailed(
  tx: AttemptUpdateClient,
  input: {
    attemptId: string;
    error: Prisma.InputJsonValue;
    completedAt: Date;
  },
) {
  await tx.taskAttempt.update({
    where: {
      id: input.attemptId,
    },
    data: {
      status: "FAILED",
      error: input.error,
      completedAt: input.completedAt,
    },
  });
}
