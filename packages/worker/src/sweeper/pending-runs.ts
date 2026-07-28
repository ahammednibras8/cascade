import { prisma } from "@cascade/database";
import { PENDING_RUN_RECOVERY_MS } from "../config.js";
import { enqueueTaskRun } from "../queue/task-runs.js";

const PENDING_RUN_SWEEP_BATCH_SIZE = 50;

export async function sweepPendingTaskRuns(now = new Date()) {
  const cutoff = new Date(now.getTime() - PENDING_RUN_RECOVERY_MS);

  const pendingRuns = await findRecoverablePendingTaskRuns(now, cutoff);

  await Promise.all(
    pendingRuns.map((pendingRun) =>
      reenqueuePendingTaskRun({
        pendingRun,
        now,
        cutoff,
      }),
    ),
  );

  return pendingRuns.length;
}

async function findRecoverablePendingTaskRuns(now: Date, cutoff: Date) {
  return prisma.taskRun.findMany({
    where: {
      status: "PENDING",
      updatedAt: {
        lt: cutoff,
      },
      OR: [
        {
          delayUntil: null,
        },
        {
          delayUntil: {
            lte: now,
          },
        },
      ],
    },
    select: {
      id: true,
      taskId: true,
      deploymentId: true,
      task: {
        select: {
          environmentId: true,
        },
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: PENDING_RUN_SWEEP_BATCH_SIZE,
  });
}

type RecoverablePendingTaskRun = Awaited<ReturnType<typeof findRecoverablePendingTaskRuns>>[number];

async function reenqueuePendingTaskRun({
  pendingRun,
  now,
  cutoff,
}: {
  pendingRun: RecoverablePendingTaskRun;
  now: Date;
  cutoff: Date;
}) {
  const claimed = await prisma.$transaction(async (tx) => {
    const update = await tx.taskRun.updateMany({
      where: {
        id: pendingRun.id,
        status: "PENDING",
        updatedAt: {
          lt: cutoff,
        },
        OR: [
          {
            delayUntil: null,
          },
          {
            delayUntil: {
              lte: now,
            },
          },
        ],
      },
      data: {
        updatedAt: now,
      },
    });

    if (update.count !== 1) {
      return false;
    }

    await tx.taskEvent.create({
      data: {
        taskRunId: pendingRun.id,
        type: "task.run.requeued",
        level: "WARN",
        message: "Pending task run was re-enqueued by recovery sweeper",
        data: {
          reason: "PENDING_RUN_RECOVERY",
          recoveryAfterMs: PENDING_RUN_RECOVERY_MS,
        },
      },
    });

    return true;
  });

  if (!claimed) {
    return;
  }

  await enqueueTaskRun({
    runId: pendingRun.id,
    taskId: pendingRun.taskId,
    environmentId: pendingRun.task.environmentId,
    deploymentId: pendingRun.deploymentId,
  });
}
