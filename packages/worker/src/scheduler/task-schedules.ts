/* eslint-disable no-await-in-loop */

import { createTaskRunEvent, prisma, type Prisma } from "@cascade/database";
import { enqueueTaskRun } from "../queue/task-runs.js";
import { getNextCronRunAt } from "@cascade/core";

const SCHEDULE_BATCH_SIZE = 50;
const SCHEDULE_LOCK_TIMEOUT_MS = 30_000;

const dueScheduleSelect = {
  id: true,
  revision: true,
  taskId: true,
  payload: true,
  scheduleType: true,
  intervalSeconds: true,
  cronExpression: true,
  timezone: true,
  nextRunAt: true,
  task: {
    select: {
      environmentId: true,
      deploymentId: true,
      executionConfig: true,
    },
  },
} satisfies Prisma.TaskScheduleSelect;

type ScheduleTiming = {
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
};

type DueSchedule = Prisma.TaskScheduleGetPayload<{
  select: typeof dueScheduleSelect;
}>;

type ScheduleTransaction = Prisma.TransactionClient;

type ScheduledRunQueueMessage = {
  runId: string;
  taskId: string;
  environmentId: string;
  deploymentId: string | null;
  delayUntil: Date | null;
};

function getNextRunAt(now: Date, schedule: ScheduleTiming): Date | null {
  if (schedule.scheduleType === "INTERVAL") {
    if (schedule.intervalSeconds === null) {
      return null;
    }

    return new Date(now.getTime() + schedule.intervalSeconds * 1000);
  }

  if (schedule.scheduleType === "CRON" && schedule.cronExpression !== null) {
    try {
      return getNextCronRunAt(
        {
          expression: schedule.cronExpression,
          timezone: schedule.timezone,
        },
        now,
      );
    } catch {
      return null;
    }
  }

  return null;
}

function getDueScheduleWhere(now: Date, staleLockCutoff: Date): Prisma.TaskScheduleWhereInput {
  return {
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
  };
}

async function findDueSchedules(now: Date, staleLockCutoff: Date) {
  return prisma.taskSchedule.findMany({
    where: getDueScheduleWhere(now, staleLockCutoff),
    select: dueScheduleSelect,
    orderBy: {
      nextRunAt: "asc",
    },
    take: SCHEDULE_BATCH_SIZE,
  });
}

async function claimSchedule(input: {
  tx: ScheduleTransaction;
  schedule: DueSchedule;
  now: Date;
  staleLockCutoff: Date;
}) {
  return input.tx.taskSchedule.updateMany({
    where: {
      id: input.schedule.id,
      revision: input.schedule.revision,
      enabled: true,
      nextRunAt: input.schedule.nextRunAt,
      OR: [
        {
          lockedAt: null,
        },
        {
          lockedAt: {
            lt: input.staleLockCutoff,
          },
        },
      ],
    },
    data: {
      lockedAt: input.now,
    },
  });
}

async function disableSchedule(tx: ScheduleTransaction, schedule: DueSchedule, reason: string) {
  await tx.taskSchedule.update({
    where: {
      id: schedule.id,
    },
    data: {
      enabled: false,
      lockedAt: null,
    },
  });

  process.stderr.write(`${reason}\n`);
}

function buildScheduledRunData(schedule: DueSchedule): Prisma.TaskRunUncheckedCreateInput {
  const data: Prisma.TaskRunUncheckedCreateInput = {
    taskId: schedule.taskId,
    environmentId: schedule.task.environmentId,
    deploymentId: schedule.task.deploymentId,
    scheduleId: schedule.id,
    scheduledFor: schedule.nextRunAt,
    status: "PENDING",
    delayUntil: schedule.nextRunAt,
    executionConfig: schedule.task.executionConfig as Prisma.InputJsonValue,
  };

  if (schedule.payload !== null) {
    data.payload = schedule.payload as Prisma.InputJsonValue;
  }

  return data;
}

async function createScheduledRun(tx: ScheduleTransaction, schedule: DueSchedule) {
  const run = await tx.taskRun.create({
    data: buildScheduledRunData(schedule),
    select: {
      id: true,
      taskId: true,
      delayUntil: true,
    },
  });

  await createTaskRunEvent(tx, {
    taskRunId: run.id,
    type: "task.schedule.triggered",
    level: "INFO",
    message: "Scheduled task run created",
    data: {
      scheduleId: schedule.id,
      scheduleRevision: schedule.revision,
      scheduledFor: schedule.nextRunAt.toISOString(),
      scheduleType: schedule.scheduleType,
      cronExpression: schedule.cronExpression,
      intervalSeconds: schedule.intervalSeconds,
      timezone: schedule.timezone,
    },
  });

  return run;
}

async function updateScheduleAfterRun(input: {
  tx: ScheduleTransaction;
  schedule: DueSchedule;
  now: Date;
  nextRunAt: Date;
}) {
  await input.tx.taskSchedule.update({
    where: {
      id: input.schedule.id,
    },
    data: {
      lastRunAt: input.now,
      nextRunAt: input.nextRunAt,
      lockedAt: null,
    },
  });
}

async function processDueSchedule(input: {
  schedule: DueSchedule;
  now: Date;
  staleLockCutoff: Date;
}): Promise<ScheduledRunQueueMessage | null> {
  return prisma.$transaction(async (tx) => {
    const claimed = await claimSchedule({ tx, ...input });

    if (claimed.count !== 1) {
      return null;
    }

    const nextRunAt = getNextRunAt(input.now, input.schedule);

    if (!nextRunAt) {
      await disableSchedule(
        tx,
        input.schedule,
        `Disabled schedule ${input.schedule.id}: invalid ${input.schedule.scheduleType.toLowerCase()} schedule rule.`,
      );
      return null;
    }

    if (input.schedule.task.executionConfig === null) {
      await disableSchedule(
        tx,
        input.schedule,
        `Disabled schedule ${input.schedule.id} for task ${input.schedule.taskId}: missing execution configuration. Redeploy the task and re-enable the schedule.`,
      );
      return null;
    }

    const run = await createScheduledRun(tx, input.schedule);
    await updateScheduleAfterRun({ tx, schedule: input.schedule, now: input.now, nextRunAt });

    return {
      runId: run.id,
      taskId: run.taskId,
      environmentId: input.schedule.task.environmentId,
      deploymentId: input.schedule.task.deploymentId,
      delayUntil: run.delayUntil,
    };
  });
}

async function enqueueScheduledRun(result: ScheduledRunQueueMessage) {
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

export async function sweepDueTaskSchedules(now = new Date()) {
  const staleLockCutoff = new Date(now.getTime() - SCHEDULE_LOCK_TIMEOUT_MS);
  const dueSchedules = await findDueSchedules(now, staleLockCutoff);

  for (const schedule of dueSchedules) {
    const result = await processDueSchedule({
      schedule,
      now,
      staleLockCutoff,
    });

    if (!result) {
      continue;
    }

    await enqueueScheduledRun(result);
  }

  return dueSchedules.length;
}
