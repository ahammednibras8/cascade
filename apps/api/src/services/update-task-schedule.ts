import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";
import { parseTaskScheduleBody } from "./task-schedule-request.js";
import { maybeStoreJsonValue } from "@cascade/storage";

type UpdateTaskScheduleInput = {
  auth: ApiAuthContext;
  scheduleId: string | undefined;
  body: unknown;
};

export async function updateTaskSchedule(input: UpdateTaskScheduleInput) {
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

  const parsedBody = parseTaskScheduleBody(input.body);

  if (!parsedBody.ok) {
    return {
      ok: false as const,
      status: 400 as const,
      error: {
        code: parsedBody.code,
        message: parsedBody.message,
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
      enabled: true,
      revision: true,
      payload: true,
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

  const payloadProvided = Object.hasOwn(parsedBody.body, "payload");

  const data: Prisma.TaskScheduleUncheckedUpdateManyInput = {
    scheduleType: parsedBody.rule.scheduleType,
    intervalSeconds: parsedBody.rule.intervalSeconds,
    cronExpression: parsedBody.rule.cronExpression,
    timezone: parsedBody.rule.timezone,
    nextRunAt: parsedBody.rule.nextRunAt,
    lockedAt: null,
    revision: {
      increment: 1,
    },
  };

  if (parsedBody.name !== undefined) {
    data.name = parsedBody.name;
  }

  if (payloadProvided) {
    const payload = parsedBody.body.payload;

    if (payload === null) {
      data.payload = Prisma.DbNull;
    } else {
      data.payload = (await maybeStoreJsonValue({
        kind: "PAYLOAD",
        environmentId: input.auth.environmentId,
        taskId: schedule.taskId,
        runId: schedule.id,
        value: payload,
      })) as Prisma.InputJsonValue;
    }
  }

  const updated = await prisma.taskSchedule.updateMany({
    where: {
      id: schedule.id,
      revision: schedule.revision,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    data,
  });

  if (updated.count !== 1) {
    return {
      ok: false as const,
      status: 409 as const,
      error: {
        code: "SCHEDULE_STATE_CONFLICT",
        message: "Schedule changed before it could be updated; retry the request",
      },
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    schedule: {
      id: schedule.id,
      name: parsedBody.name ?? schedule.name,
      scheduleType: parsedBody.rule.scheduleType,
      intervalSeconds: parsedBody.rule.intervalSeconds,
      cronExpression: parsedBody.rule.cronExpression,
      timezone: parsedBody.rule.timezone,
      nextRunAt: parsedBody.rule.nextRunAt.toISOString(),
      enabled: schedule.enabled,
      hasPayload: payloadProvided ? parsedBody.body.payload !== null : schedule.payload !== null,
      revision: schedule.revision + 1,
    },
  };
}
