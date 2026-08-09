import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";
import { getNextCronRunAt } from "@cascade/core";

type ResumeTaskScheduleInput = {
  auth: ApiAuthContext;
  scheduleId: string | undefined;
};

type ScheduleTiming = {
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
};

function getNextRunAt(now: Date, schedule: ScheduleTiming): Date | null {
  if (schedule.scheduleType === "INTERVAL") {
    if (schedule.intervalSeconds === null) {
      return null;
    }

    return new Date(now.getTime() + schedule.intervalSeconds * 1000);
  }

  if (schedule.cronExpression === null) {
    return null;
  }

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

export async function resumeTaskSchedule(input: ResumeTaskScheduleInput) {
  if (!isUuid(input.scheduleId)) {
    return {
      ok: false as const,
      status: 400 as const,
      error: {
        code: "INVALID_SCHEDULE_ID",
        message: "scheduleId must be a valid UUID",
      },
    };
  }

  const schedule = await prisma.taskSchedule.findFirst({
    where: {
      id: input.scheduleId,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    select: {
      id: true,
      enabled: true,
      scheduleType: true,
      intervalSeconds: true,
      cronExpression: true,
      timezone: true,
      nextRunAt: true,
    },
  });

  if (!schedule) {
    return {
      ok: false as const,
      status: 404 as const,
      error: {
        code: "SCHEDULE_NOT_FOUND",
        message: "Schedule was not found in this environment",
      },
    };
  }

  if (schedule.enabled) {
    return {
      ok: true as const,
      status: 200 as const,
      schedule: {
        id: schedule.id,
        enabled: true,
        alreadyResumed: true,
        nextRunAt: schedule.nextRunAt.toISOString(),
      },
    };
  }

  const nextRunAt = getNextRunAt(new Date(), schedule);

  if (!nextRunAt) {
    return {
      ok: false as const,
      status: 409 as const,
      error: {
        code: "INVALID_SCHEDULE_RULE",
        message: "Schedule has an invalid rule and cannot be resumed",
      },
    };
  }

  const resumed = await prisma.taskSchedule.updateMany({
    where: {
      id: schedule.id,
      enabled: false,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    data: {
      enabled: true,
      nextRunAt,
      lockedAt: null,
      revision: {
        increment: 1,
      },
    },
  });

  if (resumed.count !== 1) {
    return {
      ok: false as const,
      status: 409 as const,
      error: {
        code: "SCHEDULE_STATE_CONFLICT",
        message: "Schedule state changed before it could be resumed; retry the request",
      },
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    schedule: {
      id: schedule.id,
      enabled: true,
      alreadyResumed: false,
      nextRunAt: nextRunAt.toISOString(),
    },
  };
}
