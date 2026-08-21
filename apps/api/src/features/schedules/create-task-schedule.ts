import type { ApiAuthContext } from "../../auth/api-key.js";
import { Prisma, prisma } from "@cascade/database";
import { maybeStoreJsonValue } from "@cascade/storage";
import { randomUUID } from "node:crypto";
import { getPayload } from "../../lib/trigger-payload.js";
import { isUuid } from "../../lib/route-params.js";
import { parseTaskScheduleBody } from "./task-schedule-request.js";
import { failure, success } from "../../lib/service-result.js";

type CreateTaskScheduleInput = {
  auth: ApiAuthContext;
  taskId: string | undefined;
  body: unknown;
};

type ScheduleResponse = {
  id: string;
  taskId: string;
  name: string;
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: string;
  enabled: boolean;
  payload: unknown;
  createdAt: string;
};

type CreateTaskScheduleResult =
  | { ok: true; status: 201; schedule: ScheduleResponse }
  | {
      ok: false;
      status: 400 | 404;
      error: {
        code: string;
        message: string;
      };
    };

const SCHEDULE_SELECT = {
  id: true,
  taskId: true,
  name: true,
  scheduleType: true,
  intervalSeconds: true,
  cronExpression: true,
  timezone: true,
  nextRunAt: true,
  enabled: true,
  payload: true,
  createdAt: true,
};

function toScheduleResponse(schedule: {
  id: string;
  taskId: string;
  name: string;
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: Date;
  enabled: boolean;
  payload: unknown;
  createdAt: Date;
}): ScheduleResponse {
  return {
    id: schedule.id,
    taskId: schedule.taskId,
    name: schedule.name,
    scheduleType: schedule.scheduleType,
    intervalSeconds: schedule.intervalSeconds,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    nextRunAt: schedule.nextRunAt.toISOString(),
    enabled: schedule.enabled,
    payload: schedule.payload,
    createdAt: schedule.createdAt.toISOString(),
  };
}

export async function createTaskSchedule(
  input: CreateTaskScheduleInput,
): Promise<CreateTaskScheduleResult> {
  const { auth, taskId, body } = input;

  if (!isUuid(taskId)) {
    return failure(400, "INVALID_TASK_ID", "taskId must be a valid UUID");
  }

  const parsedBody = parseTaskScheduleBody(body);

  if (!parsedBody.ok) {
    return failure(400, parsedBody.code, parsedBody.message);
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      environmentId: auth.environmentId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!task) {
    return failure(404, "TASK_NOT_FOUND", "Task was not found in this environment");
  }

  const payload = getPayload(parsedBody.body);
  const scheduleId = randomUUID();
  const data: Prisma.TaskScheduleUncheckedCreateInput = {
    id: scheduleId,
    taskId,
    name: parsedBody.name ?? `${task.name} schedule`,
    scheduleType: parsedBody.rule.scheduleType,
    intervalSeconds: parsedBody.rule.intervalSeconds,
    cronExpression: parsedBody.rule.cronExpression,
    timezone: parsedBody.rule.timezone,
    nextRunAt: parsedBody.rule.nextRunAt,
  };

  if (payload !== undefined) {
    data.payload = (await maybeStoreJsonValue({
      kind: "PAYLOAD",
      environmentId: auth.environmentId,
      taskId,
      runId: scheduleId,
      value: payload,
    })) as Prisma.InputJsonValue;
  }

  const schedule = await prisma.taskSchedule.create({
    data,
    select: SCHEDULE_SELECT,
  });

  return success(201, {
    schedule: toScheduleResponse(schedule),
  });
}
