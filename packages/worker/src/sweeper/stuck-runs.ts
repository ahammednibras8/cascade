import { prisma, Prisma } from "@cascade/database";
import { taskRegistry } from "../tasks/registry.js";
import { getRetryDelayMs } from "../retry.js";
import { enqueueTaskRun } from "../queue/task-runs.js";

const STUCK_RUN_TIMEOUT_MS = 30_000;
const STUCK_RUN_SWEEP_BATCH_SIZE = 50;

function createStuckRunError(input: {
  lastHeartbeatAt: Date | null;
  timeoutMs: number;
}): Prisma.InputJsonValue {
  return {
    code: "STUCK_RUN",
    message: "Task run stopped heartbeating while executing",
    lastHeartbeatAt: input.lastHeartbeatAt?.toISOString() ?? null,
    timeoutMs: input.timeoutMs,
  };
}

export async function sweepStuckTaskRuns(now = new Date()) {
  const cutoff = new Date(now.getTime() - STUCK_RUN_TIMEOUT_MS);

  const stuckRuns = await prisma.taskRun.findMany({
    where: {
      status: "EXECUTING",
      OR: [
        {
          lastHeartbeatAt: null,
        },
        {
          lastHeartbeatAt: {
            lt: cutoff,
          },
        },
      ],
    },
    select: {
      id: true,
      taskId: true,
      lastHeartbeatAt: true,
      task: {
        select: {
          slug: true,
          environmentId: true,
        },
      },
      attempts: {
        orderBy: {
          attemptNumber: "desc",
        },
        take: 1,
        select: {
          id: true,
          attemptNumber: true,
        },
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: STUCK_RUN_SWEEP_BATCH_SIZE,
  });

  for (const stuckRun of stuckRuns) {
    const latestAttempt = stuckRun.attempts[0];
    const localTask = taskRegistry.get(stuckRun.task.slug);
    const attemptNumber = latestAttempt?.attemptNumber ?? 1;
    const shouldRetry = Boolean(localTask && attemptNumber < localTask.retry.maxAttempts);
    const retryDelayMs =
      shouldRetry && localTask ? getRetryDelayMs(attemptNumber, localTask.retry) : 0;

    const error = createStuckRunError({
      lastHeartbeatAt: stuckRun.lastHeartbeatAt,
      timeoutMs: STUCK_RUN_TIMEOUT_MS,
    });

    const claimed = await prisma.$transaction(async (tx) => {
      const updateRun = await tx.taskRun.updateMany({
        where: {
          id: stuckRun.id,
          status: "EXECUTING",
          OR: [
            {
              lastHeartbeatAt: null,
            },
            {
              lastHeartbeatAt: {
                lt: cutoff,
              },
            },
          ],
        },
        data: shouldRetry
          ? {
              status: "PENDING",
              output: Prisma.DbNull,
              error,
              latestAttempt: now,
              completedAt: null,
            }
          : {
              status: "FAILED",
              output: Prisma.DbNull,
              error,
              lastHeartbeatAt: now,
              completedAt: now,
            },
      });

      if (updateRun.count !== 1) {
        return false;
      }

      if (latestAttempt) {
        await tx.taskAttempt.update({
          where: {
            id: latestAttempt.id,
          },
          data: {
            status: "FAILED",
            error,
            completedAt: now,
          },
        });
      }

      await tx.taskEvent.create({
        data: {
          taskRunId: stuckRun.id,
          ...(latestAttempt ? { taskAttemptId: latestAttempt.id } : {}),
          type: shouldRetry ? "task.run.retry.scheduled" : "task.run.failed",
          level: shouldRetry ? "WARN" : "ERROR",
          message: shouldRetry
            ? "Task run stopped heartbeating and retry was scheduled"
            : "Task run stopped heartbeating and was marked failed",
          data: {
            reason: "STUCK_RUN",
            attemptNumber,
            nextAttemptNumber: shouldRetry ? attemptNumber + 1 : null,
            maxAttempts: localTask?.retry.maxAttempts ?? null,
            delayMs: retryDelayMs,
            error,
          },
        },
      });

      return true;
    });

    if (claimed && shouldRetry) {
      await enqueueTaskRun(
        {
          runId: stuckRun.id,
          taskId: stuckRun.taskId,
          environmentId: stuckRun.task.environmentId,
        },
        {
          delayMs: retryDelayMs,
        },
      );
    }
  }

  return stuckRuns.length;
}
