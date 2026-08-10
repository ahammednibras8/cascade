import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";

type GetTaskScheduleInput = {
  auth: ApiAuthContext;
  scheduleId: string | undefined;
};

export async function getTaskSchedule(input: GetTaskScheduleInput) {
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
      taskId: true,
      name: true,
      scheduleType: true,
      intervalSeconds: true,
      cronExpression: true,
      timezone: true,
      nextRunAt: true,
      lastRunAt: true,
      enabled: true,
      payload: true,
      revision: true,
      createdAt: true,
      updatedAt: true,
      task: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
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

  return {
    ok: true as const,
    status: 200 as const,
    schedule: {
      id: schedule.id,
      taskId: schedule.taskId,
      name: schedule.name,
      scheduleType: schedule.scheduleType,
      intervalSeconds: schedule.intervalSeconds,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      nextRunAt: schedule.nextRunAt.toISOString(),
      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      enabled: schedule.enabled,
      payload: schedule.payload,
      revision: schedule.revision,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
      task: schedule.task,
    },
  };
}
