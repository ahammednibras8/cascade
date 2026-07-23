import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";
import { prisma, Prisma } from "@cascade/database";
import { getPayload } from "../lib/trigger-payload.js";

type CreateTaskScheduleInput = {
  auth: ApiAuthContext;
  taskId: string | undefined;
  body: unknown;
};

type CreateTaskScheduleResult =
  | {
      ok: true;
      status: 201;
      schedule: {
        id: string;
        taskId: string;
        name: string;
        intervalSeconds: number;
        nextRunAt: string;
        enabled: boolean;
        payload: unknown;
        createdAt: string;
      };
    }
  | {
      ok: false;
      status: 400 | 404;
      error: {
        code: string;
        message: string;
      };
    };

function getBodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}

function getIntervalSeconds(body: Record<string, unknown>) {
  const intervalSeconds = body.intervalSeconds;

  if (typeof intervalSeconds !== "number") {
    return null;
  }

  if (!Number.isInteger(intervalSeconds)) {
    return null;
  }

  return intervalSeconds;
}

function getStartAt(body: Record<string, unknown>, intervalSeconds: number) {
  const rawStartAt = body.startAt;

  if (rawStartAt === undefined || rawStartAt === null) {
    return {
      ok: true as const,
      nextRunAt: new Date(Date.now() + intervalSeconds * 1000),
    };
  }

  if (typeof rawStartAt !== "string") {
    return {
      ok: false as const,
      message: "startAt must be an ISO date string",
    };
  }

  const startAt = new Date(rawStartAt);

  if (Number.isNaN(startAt.getTime())) {
    return {
      ok: false as const,
      message: "startAt must be a valid ISO date string",
    };
  }

  return {
    ok: true as const,
    nextRunAt: startAt,
  };
}

export async function createTaskSchedule(
  input: CreateTaskScheduleInput,
): Promise<CreateTaskScheduleResult> {
  const { auth, taskId, body } = input;

  if (!isUuid(taskId)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_TASK_ID",
        message: "taskId must be a valid UUID",
      },
    };
  }

  const requestBody = getBodyObject(body);
  const intervalSeconds = getIntervalSeconds(requestBody);

  if (intervalSeconds === null || intervalSeconds < 60) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_INTERVAL_SECONDS",
        message: "intervalSeconds must be an integer greater than or equal to 60",
      },
    };
  }

  const startAtResult = getStartAt(requestBody, intervalSeconds);

  if (!startAtResult.ok) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_START_AT",
        message: startAtResult.message,
      },
    };
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
    return {
      ok: false,
      status: 404,
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task was not found in this environment",
      },
    };
  }

  const payload = getPayload(body);
  const name =
    typeof requestBody.name === "string" && requestBody.name.trim()
      ? requestBody.name.trim()
      : `${task.name} schedule`;

  const data: Prisma.TaskScheduleUncheckedCreateInput = {
    taskId,
    name,
    intervalSeconds,
    nextRunAt: startAtResult.nextRunAt,
  };

  if (payload !== undefined) {
    data.payload = payload;
  }

  const schedule = await prisma.taskSchedule.create({
    data,
    select: {
      id: true,
      taskId: true,
      name: true,
      intervalSeconds: true,
      nextRunAt: true,
      enabled: true,
      payload: true,
      createdAt: true,
    },
  });

  return {
    ok: true,
    status: 201,
    schedule: {
      id: schedule.id,
      taskId: schedule.taskId,
      name: schedule.name,
      intervalSeconds: schedule.intervalSeconds,
      nextRunAt: schedule.nextRunAt.toISOString(),
      enabled: schedule.enabled,
      payload: schedule.payload,
      createdAt: schedule.createdAt.toISOString(),
    },
  };
}
