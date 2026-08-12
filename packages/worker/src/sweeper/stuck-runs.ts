/* eslint-disable no-await-in-loop */

import { parseTaskExecutionConfig } from "@cascade/core";
import { createTaskRunEvent, prisma, Prisma } from "@cascade/database";
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
      deploymentId: true,
      executionConfig: true,
      lastHeartbeatAt: true,
      task: {
        select: {
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
    const executionConfig = parseTaskExecutionConfig(stuckRun.executionConfig);
    const attemptNumber = latestAttempt?.attemptNumber ?? 1;
    const shouldRetry = Boolean(
      executionConfig && attemptNumber < executionConfig.retry.maxAttempts,
    );
    const retryDelayMs =
      executionConfig && shouldRetry ? getRetryDelayMs(attemptNumber, executionConfig.retry) : 0;

    const retryAt = shouldRetry ? new Date(now.getTime() + retryDelayMs) : null;

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
              delayUntil: retryAt,
              output: Prisma.DbNull,
              error,
              lastHeartbeatAt: null,
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

      await createTaskRunEvent(tx, {
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
          maxAttempts: executionConfig?.retry.maxAttempts ?? null,
          delayMs: retryDelayMs,
          error,
        },
      });

      return true;
    });

    if (claimed && retryAt) {
      await enqueueTaskRun(
        {
          runId: stuckRun.id,
          taskId: stuckRun.taskId,
          environmentId: stuckRun.task.environmentId,
          deploymentId: stuckRun.deploymentId,
        },
        {
          delayMs: Math.max(retryAt.getTime() - now.getTime(), 0),
        },
      );
    }
  }

  return stuckRuns.length;
}
