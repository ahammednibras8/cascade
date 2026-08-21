/* eslint-disable no-await-in-loop */

import { parseTaskExecutionConfig } from "@cascade/core";
import { createTaskRunEvent, prisma, Prisma } from "@cascade/database";
import { getRetryDelayMs } from "../retry.js";
import { enqueueTaskRun } from "../queue/task-runs.js";

const STUCK_RUN_TIMEOUT_MS = 30_000;
const STUCK_RUN_SWEEP_BATCH_SIZE = 50;

const stuckRunSelect = {
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
} satisfies Prisma.TaskRunSelect;

type StuckRun = Prisma.TaskRunGetPayload<{
  select: typeof stuckRunSelect;
}>;

type StuckRunTransaction = Prisma.TransactionClient;

type RetryDecision = {
  attemptNumber: number;
  shouldRetry: boolean;
  retryDelayMs: number;
  retryAt: Date | null;
  maxAttempts: number | null;
};

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

function getStuckRunWhere(cutoff: Date): Prisma.TaskRunWhereInput {
  return {
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
  };
}

async function findStuckRuns(cutoff: Date) {
  return prisma.taskRun.findMany({
    where: getStuckRunWhere(cutoff),
    select: stuckRunSelect,
    orderBy: {
      updatedAt: "asc",
    },
    take: STUCK_RUN_SWEEP_BATCH_SIZE,
  });
}

function getRetryDecision(stuckRun: StuckRun, now: Date): RetryDecision {
  const latestAttempt = stuckRun.attempts[0];
  const executionConfig = parseTaskExecutionConfig(stuckRun.executionConfig);
  const attemptNumber = latestAttempt?.attemptNumber ?? 1;
  const shouldRetry = Boolean(executionConfig && attemptNumber < executionConfig.retry.maxAttempts);
  const retryDelayMs =
    executionConfig && shouldRetry ? getRetryDelayMs(attemptNumber, executionConfig.retry) : 0;

  return {
    attemptNumber,
    shouldRetry,
    retryDelayMs,
    retryAt: shouldRetry ? new Date(now.getTime() + retryDelayMs) : null,
    maxAttempts: executionConfig?.retry.maxAttempts ?? null,
  };
}

function getStuckRunUpdateData(input: {
  decision: RetryDecision;
  error: Prisma.InputJsonValue;
  now: Date;
}): Prisma.TaskRunUpdateManyMutationInput {
  if (input.decision.shouldRetry) {
    return {
      status: "PENDING",
      delayUntil: input.decision.retryAt,
      output: Prisma.DbNull,
      error: input.error,
      lastHeartbeatAt: null,
      completedAt: null,
    };
  }

  return {
    status: "FAILED",
    output: Prisma.DbNull,
    error: input.error,
    lastHeartbeatAt: input.now,
    completedAt: input.now,
  };
}

async function updateLatestAttempt(input: {
  tx: StuckRunTransaction;
  latestAttempt: StuckRun["attempts"][number] | undefined;
  error: Prisma.InputJsonValue;
  now: Date;
}) {
  if (!input.latestAttempt) {
    return;
  }

  await input.tx.taskAttempt.update({
    where: {
      id: input.latestAttempt.id,
    },
    data: {
      status: "FAILED",
      error: input.error,
      completedAt: input.now,
    },
  });
}

async function writeStuckRunEvent(input: {
  tx: StuckRunTransaction;
  stuckRun: StuckRun;
  decision: RetryDecision;
  error: Prisma.InputJsonValue;
}) {
  const latestAttempt = input.stuckRun.attempts[0];

  await createTaskRunEvent(input.tx, {
    taskRunId: input.stuckRun.id,
    ...(latestAttempt ? { taskAttemptId: latestAttempt.id } : {}),
    type: input.decision.shouldRetry ? "task.run.retry.scheduled" : "task.run.failed",
    level: input.decision.shouldRetry ? "WARN" : "ERROR",
    message: input.decision.shouldRetry
      ? "Task run stopped heartbeating and retry was scheduled"
      : "Task run stopped heartbeating and was marked failed",
    data: {
      reason: "STUCK_RUN",
      attemptNumber: input.decision.attemptNumber,
      nextAttemptNumber: input.decision.shouldRetry ? input.decision.attemptNumber + 1 : null,
      maxAttempts: input.decision.maxAttempts,
      delayMs: input.decision.retryDelayMs,
      error: input.error,
    },
  });
}

async function claimStuckRun(input: { stuckRun: StuckRun; cutoff: Date; now: Date }) {
  const decision = getRetryDecision(input.stuckRun, input.now);
  const error = createStuckRunError({
    lastHeartbeatAt: input.stuckRun.lastHeartbeatAt,
    timeoutMs: STUCK_RUN_TIMEOUT_MS,
  });

  return prisma.$transaction(async (tx) => {
    const updateRun = await tx.taskRun.updateMany({
      where: {
        id: input.stuckRun.id,
        ...getStuckRunWhere(input.cutoff),
      },
      data: getStuckRunUpdateData({ decision, error, now: input.now }),
    });

    if (updateRun.count !== 1) {
      return false;
    }

    await updateLatestAttempt({
      tx,
      latestAttempt: input.stuckRun.attempts[0],
      error,
      now: input.now,
    });
    await writeStuckRunEvent({ tx, stuckRun: input.stuckRun, decision, error });

    return decision;
  });
}

async function enqueueRetry(stuckRun: StuckRun, retryAt: Date, now: Date) {
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

export async function sweepStuckTaskRuns(now = new Date()) {
  const cutoff = new Date(now.getTime() - STUCK_RUN_TIMEOUT_MS);
  const stuckRuns = await findStuckRuns(cutoff);

  for (const stuckRun of stuckRuns) {
    const decision = await claimStuckRun({ stuckRun, cutoff, now });

    if (decision && decision.retryAt) {
      await enqueueRetry(stuckRun, decision.retryAt, now);
    }
  }

  return stuckRuns.length;
}
