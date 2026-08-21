import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success } from "../../lib/service-result.js";

type PauseTaskScheduleInput = {
  auth: ApiAuthContext;
  scheduleId: string | undefined;
};

export async function pauseTaskSchedule(input: PauseTaskScheduleInput) {
  if (!isUuid(input.scheduleId)) {
    return failure(400, "INVALID_SCHEDULE_ID", "scheduleId must be a valid UUID");
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
    return success(200, {
      schedule: {
        id: input.scheduleId,
        enabled: false,
        alreadyPaused: false,
      },
    });
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
    return failure(404, "SCHEDULE_NOT_FOUND", "Schedule was not found in this environment");
  }

  return success(200, {
    schedule: {
      id: existingSchedule.id,
      enabled: false,
      alreadyPaused: true,
    },
  });
}
