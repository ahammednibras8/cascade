import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success } from "../../lib/service-result.js";

type DeleteTaskScheduleInput = {
  auth: ApiAuthContext;
  scheduleId: string | undefined;
};

export async function deleteTaskSchedule(input: DeleteTaskScheduleInput) {
  if (!isUuid(input.scheduleId)) {
    return failure(400, "INVALID_SCHEDULE_ID", "scheduleId must be a valid UUID");
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
    return failure(404, "SCHEDULE_NOT_FOUND", "Schedule was not found in this environment");
  }

  return success(204);
}
