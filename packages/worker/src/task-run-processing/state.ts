import type { TraceContext } from "@cascade/core";
import { Prisma, prisma } from "@cascade/database";
import type { TaskRunQueueMessage } from "../queue/task-runs.js";

export type ProcessableTaskRun = {
  id: string;
  taskId: string;
  status: string;
  payload: unknown;
  delayUntil: Date | null;
  traceId: string | null;
  triggerSpanId: string | null;
  task: {
    slug: string;
    name: string;
  };
};

export type TaskRunAttempt = {
  id: string;
  attemptNumber: number;
};

export async function loadTaskRunForProcessing(message: TaskRunQueueMessage) {
  return (await prisma.taskRun.findFirst({
    where: {
      id: message.runId,
      taskId: message.taskId,
      task: {
        environmentId: message.environmentId,
      },
    },
    select: {
      id: true,
      taskId: true,
      status: true,
      payload: true,
      delayUntil: true,
      traceId: true,
      triggerSpanId: true,
      task: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  })) as ProcessableTaskRun | null;
}

export async function deferTaskRun(input: { taskRunId: string; retryAt: Date }) {
  return prisma.taskRun.updateMany({
    where: {
      id: input.taskRunId,
      status: "PENDING",
    },
    data: {
      delayUntil: input.retryAt,
    },
  });
}

export async function claimTaskRunForExecution(input: {
  taskRun: ProcessableTaskRun;
  trace: TraceContext;
}) {
  return prisma.$transaction(async (tx) => {
    const startedAt = new Date();

    const claim = await tx.taskRun.updateMany({
      where: {
        id: input.taskRun.id,
        status: "PENDING",
        OR: [
          {
            delayUntil: null,
          },
          {
            delayUntil: {
              lte: startedAt,
            },
          },
        ],
      },
      data: {
        status: "EXECUTING",
        delayUntil: null,
        startedAt,
        lastHeartbeatAt: startedAt,
        completedAt: null,
        output: Prisma.DbNull,
        error: Prisma.DbNull,
        traceId: input.trace.traceId,
      },
    });

    if (claim.count !== 1) {
      return null;
    }

    const previousAttempts = await tx.taskAttempt.count({
      where: {
        taskRunId: input.taskRun.id,
      },
    });

    const attempt = await tx.taskAttempt.create({
      data: {
        taskRunId: input.taskRun.id,
        attemptNumber: previousAttempts + 1,
        status: "EXECUTING",
        startedAt: new Date(),
      },
      select: {
        id: true,
        attemptNumber: true,
      },
    });

    await tx.taskEvent.create({
      data: {
        taskRunId: input.taskRun.id,
        taskAttemptId: attempt.id,
        type: "task.run.started",
        level: "INFO",
        message: "Task run started by worker",
        traceId: input.trace.traceId,
        spanId: input.trace.spanId,
        parentSpanId: input.trace.parentSpanId,
      },
    });

    return attempt;
  });
}
