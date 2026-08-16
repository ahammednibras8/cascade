import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";

type PauseTaskScheduleInput = {
  auth: ApiAuthContext;
  scheduleId: string | undefined;
};

export async function pauseTaskSchedule(input: PauseTaskScheduleInput) {
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

  const paused = await prisma.taskSchedule.updateMany({
    where: {
      id: input.scheduleId,
      enabled: true,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    data: {
      enabled: false,
      lockedAt: null,
      revision: {
        increment: 1,
      },
    },
  });

  if (paused.count === 1) {
    return {
      ok: true as const,
      status: 200 as const,
      schedule: {
        id: input.scheduleId,
        enabled: false,
        alreadyPaused: false,
      },
    };
  }

  const existingSchedule = await prisma.taskSchedule.findFirst({
    where: {
      id: input.scheduleId,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    select: {
      id: true,
      enabled: true,
    },
  });

  if (!existingSchedule) {
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
      id: existingSchedule.id,
      enabled: false,
      alreadyPaused: true,
    },
  };
}
