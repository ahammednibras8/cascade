/* eslint-disable no-await-in-loop */

import { prisma, type Prisma } from "@cascade/database";
import { enqueueTaskRun } from "../queue/task-runs.js";

const SCHEDULE_BATCH_SIZE = 50;
const SCHEDULE_LOCK_TIMEOUT_MS = 30_000;

function getNextRunAt(now: Date, intervalSeconds: number) {
  return new Date(now.getTime() + intervalSeconds * 1000);
}

export async function sweepDueTaskSchedules(now = new Date()) {
  const staleLockCutoff = new Date(now.getTime() - SCHEDULE_LOCK_TIMEOUT_MS);

  const dueSchedules = await prisma.taskSchedule.findMany({
    where: {
      enabled: true,
      nextRunAt: {
        lte: now,
      },
      OR: [
        {
          lockedAt: null,
        },
        {
          lockedAt: {
            lt: staleLockCutoff,
          },
        },
      ],
    },
    select: {
      id: true,
      revision: true,
      taskId: true,
      payload: true,
      intervalSeconds: true,
      nextRunAt: true,
      task: {
        select: {
          environmentId: true,
          deploymentId: true,
          executionConfig: true,
        },
      },
    },
    orderBy: {
      nextRunAt: "asc",
    },
    take: SCHEDULE_BATCH_SIZE,
  });

  for (const schedule of dueSchedules) {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.taskSchedule.updateMany({
        where: {
          id: schedule.id,
          revision: schedule.revision,
          enabled: true,
          nextRunAt: {
            lte: now,
          },
          OR: [
            {
              lockedAt: null,
            },
            {
              lockedAt: {
                lt: staleLockCutoff,
              },
            },
          ],
        },
        data: {
          lockedAt: now,
        },
      });

      if (claimed.count !== 1) {
        return null;
      }

      if (schedule.task.executionConfig === null) {
        await tx.taskSchedule.update({
          where: {
            id: schedule.id,
          },
          data: {
            enabled: false,
            lockedAt: null,
          },
        });

        process.stderr.write(
          `Disabled schedule ${schedule.id} for task ${schedule.taskId}: missing execution configuration. Redeploy the task and re-enable the schedule.\n`,
        );

        return null;
      }

      const runData: Prisma.TaskRunUncheckedCreateInput = {
        taskId: schedule.taskId,
        deploymentId: schedule.task.deploymentId,
        scheduleId: schedule.id,
        scheduledFor: schedule.nextRunAt,
        status: "PENDING",
        delayUntil: schedule.nextRunAt,
        executionConfig: schedule.task.executionConfig as Prisma.InputJsonValue,
      };

      if (schedule.payload !== null) {
        runData.payload = schedule.payload as Prisma.InputJsonValue;
      }

      const run = await tx.taskRun.create({
        data: runData,
        select: {
          id: true,
          taskId: true,
          delayUntil: true,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskRunId: run.id,
          type: "task.schedule.triggered",
          level: "INFO",
          message: "Scheduled task run created",
          data: {
            scheduleId: schedule.id,
            scheduleRevision: schedule.revision,
            scheduledFor: schedule.nextRunAt.toISOString(),
            intervalSeconds: schedule.intervalSeconds,
          },
        },
      });

      await tx.taskSchedule.update({
        where: {
          id: schedule.id,
        },
        data: {
          lastRunAt: now,
          nextRunAt: getNextRunAt(now, schedule.intervalSeconds),
          lockedAt: null,
        },
      });

      return {
        runId: run.id,
        taskId: run.taskId,
        environmentId: schedule.task.environmentId,
        deploymentId: schedule.task.deploymentId,
        delayUntil: run.delayUntil,
      };
    });

    if (!result) {
      continue;
    }

    const delayMs = result.delayUntil ? Math.max(result.delayUntil.getTime() - Date.now(), 0) : 0;

    await enqueueTaskRun(
      {
        runId: result.runId,
        taskId: result.taskId,
        environmentId: result.environmentId,
        deploymentId: result.deploymentId,
      },
      {
        delayMs,
      },
    );
  }

  return dueSchedules.length;
}
