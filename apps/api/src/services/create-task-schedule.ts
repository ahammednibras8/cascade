import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";
import { prisma, Prisma } from "@cascade/database";
import { getPayload } from "../lib/trigger-payload.js";
import { maybeStoreJsonValue } from "@cascade/storage";
import { getNextCronRunAt, parseCronSchedule } from "@cascade/core";

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
        scheduleType: "INTERVAL" | "CRON";
        intervalSeconds: number | null;
        cronExpression: string | null;
        timezone: string;
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

const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 31_536_000;
const MAX_SCHEDULE_NAME_LENGTH = 200;

const UTC_ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;

type ParsedScheduleRule =
  | {
      scheduleType: "INTERVAL";
      intervalSeconds: number;
      cronExpression: null;
      timezone: "UTC";
      nextRunAt: Date;
    }
  | {
      scheduleType: "CRON";
      intervalSeconds: null;
      cronExpression: string;
      timezone: string;
      nextRunAt: Date;
    };

type ParsedScheduleBody =
  | {
      ok: true;
      body: Record<string, unknown>;
      name: string | undefined;
      rule: ParsedScheduleRule;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStartAt(value: unknown) {
  if (value === undefined || value === null) {
    return {
      ok: true as const,
      startAt: undefined,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "startAt must be a valid UTC ISO 8601 timestamp",
    };
  }

  const match = UTC_ISO_TIMESTAMP_PATTERN.exec(value);

  if (!match) {
    return {
      ok: false as const,
      message: "startAt must be a valid UTC ISO 8601 timestamp",
    };
  }

  const startAt = new Date(value);

  if (
    Number.isNaN(startAt.getTime()) ||
    startAt.getUTCFullYear() !== Number(match[1]) ||
    startAt.getUTCMonth() + 1 !== Number(match[2]) ||
    startAt.getUTCDate() !== Number(match[3]) ||
    startAt.getUTCHours() !== Number(match[4]) ||
    startAt.getUTCMinutes() !== Number(match[5]) ||
    startAt.getUTCSeconds() !== Number(match[6])
  ) {
    return {
      ok: false as const,
      message: "startAt must be a valid UTC ISO 8601 timestamp",
    };
  }

  return {
    ok: true as const,
    startAt,
  };
}

function parseScheduleType(value: unknown): "INTERVAL" | "CRON" | null {
  if (value === undefined || value === "INTERVAL") {
    return "INTERVAL";
  }

  if (value === "CRON") {
    return "CRON";
  }

  return null;
}

function parseScheduleBody(body: unknown): ParsedScheduleBody {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "INVALID_BODY",
      message: "Body must be an object",
    };
  }

  const scheduleType = parseScheduleType(body.scheduleType);

  if (!scheduleType) {
    return {
      ok: false,
      code: "INVALID_SCHEDULE_TYPE",
      message: "scheduleType must be INTERVAL or CRON",
    };
  }

  let name: string | undefined;

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return {
        ok: false,
        code: "INVALID_SCHEDULE_NAME",
        message: `name must be a non-empty string with at most ${MAX_SCHEDULE_NAME_LENGTH} characters`,
      };
    }

    const trimmedName = body.name.trim();

    if (!trimmedName || trimmedName.length > MAX_SCHEDULE_NAME_LENGTH) {
      return {
        ok: false,
        code: "INVALID_SCHEDULE_NAME",
        message: `name must be a non-empty string with at most ${MAX_SCHEDULE_NAME_LENGTH} characters`,
      };
    }

    name = trimmedName;
  }

  const parsedStartAt = parseStartAt(body.startAt);

  if (!parsedStartAt.ok) {
    return {
      ok: false,
      code: "INVALID_START_AT",
      message: parsedStartAt.message,
    };
  }

  if (scheduleType === "INTERVAL") {
    if (body.cronExpression !== undefined || body.timezone !== undefined) {
      return {
        ok: false,
        code: "INVALID_SCHEDULE_RULE",
        message: "INTERVAL schedules must not include cronExpression or timezone",
      };
    }

    const intervalSeconds = body.intervalSeconds;

    if (
      typeof intervalSeconds !== "number" ||
      !Number.isInteger(intervalSeconds) ||
      intervalSeconds < MIN_INTERVAL_SECONDS ||
      intervalSeconds > MAX_INTERVAL_SECONDS
    ) {
      return {
        ok: false,
        code: "INVALID_INTERVAL_SECONDS",
        message: `intervalSeconds must be an integer between ${MIN_INTERVAL_SECONDS} and ${MAX_INTERVAL_SECONDS}`,
      };
    }

    return {
      ok: true,
      body,
      name,
      rule: {
        scheduleType: "INTERVAL",
        intervalSeconds,
        cronExpression: null,
        timezone: "UTC",
        nextRunAt: parsedStartAt.startAt ?? new Date(Date.now() + intervalSeconds * 1000),
      },
    };
  }

  if (body.intervalSeconds !== undefined) {
    return {
      ok: false,
      code: "INVALID_SCHEDULE_RULE",
      message: "CRON schedules must not include intervalSeconds",
    };
  }

  const cronSchedule = parseCronSchedule({
    expression: body.cronExpression,
    timezone: body.timezone,
  });

  if (!cronSchedule) {
    return {
      ok: false,
      code: "INVALID_CRON_SCHEDULE",
      message:
        "cronExpression must be a valid five-field cron expression and timezone must be a valid IANA timezone",
    };
  }

  try {
    return {
      ok: true,
      body,
      name,
      rule: {
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: cronSchedule.expression,
        timezone: cronSchedule.timezone,
        nextRunAt: getNextCronRunAt(
          cronSchedule,
          parsedStartAt.startAt ? new Date(parsedStartAt.startAt.getTime() - 1) : new Date(),
        ),
      },
    };
  } catch {
    return {
      ok: false,
      code: "INVALID_CRON_SCHEDULE",
      message:
        "cronExpression must be a valid five-field cron expression and timezone must be a valid IANA timezone",
    };
  }
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

  const parsedBody = parseScheduleBody(body);

  if (!parsedBody.ok) {
    return {
      ok: false,
      status: 400,
      error: {
        code: parsedBody.code,
        message: parsedBody.message,
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

  const payload = getPayload(parsedBody.body);
  const name = parsedBody.name ?? `${task.name} schedule`;

  const data: Prisma.TaskScheduleUncheckedCreateInput = {
    taskId,
    name,
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
      runId: taskId,
      value: payload,
    })) as Prisma.InputJsonValue;
  }

  const schedule = await prisma.taskSchedule.create({
    data,
    select: {
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
    },
  });

  return {
    ok: true,
    status: 201,
    schedule: {
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
    },
  };
}
