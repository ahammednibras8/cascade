import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";

type DeleteTaskScheduleInput = {
  auth: ApiAuthContext;
  scheduleId: string | undefined;
};

export async function deleteTaskSchedule(input: DeleteTaskScheduleInput) {
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

  const deleted = await prisma.taskSchedule.deleteMany({
    where: {
      id: input.scheduleId,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
  });

  if (deleted.count !== 1) {
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
    status: 204 as const,
  };
}
