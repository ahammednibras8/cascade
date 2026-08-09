import { getNextCronRunAt, parseCronSchedule } from "@cascade/core";

const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 31_536_000;
const MAX_SCHEDULE_NAME_LENGTH = 200;
const INVALID_CRON_MESSAGE =
  "cronExpression must be a valid five-field cron expression and timezone must be a valid IANA timezone";
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

type ParsedStartAt = { ok: true; startAt: Date | undefined } | { ok: false; message: string };

export type ParsedScheduleBody =
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

function invalidRule(code: string, message: string): ParsedScheduleBody {
  return { ok: false, code, message };
}

function parseStartAt(value: unknown): ParsedStartAt {
  if (value === undefined || value === null) {
    return { ok: true, startAt: undefined };
  }

  if (typeof value !== "string") {
    return { ok: false, message: "startAt must be a valid UTC ISO 8601 timestamp" };
  }

  const match = UTC_ISO_TIMESTAMP_PATTERN.exec(value);
  const startAt = match ? new Date(value) : null;

  if (
    !match ||
    !startAt ||
    Number.isNaN(startAt.getTime()) ||
    startAt.getUTCFullYear() !== Number(match[1]) ||
    startAt.getUTCMonth() + 1 !== Number(match[2]) ||
    startAt.getUTCDate() !== Number(match[3]) ||
    startAt.getUTCHours() !== Number(match[4]) ||
    startAt.getUTCMinutes() !== Number(match[5]) ||
    startAt.getUTCSeconds() !== Number(match[6])
  ) {
    return { ok: false, message: "startAt must be a valid UTC ISO 8601 timestamp" };
  }

  return { ok: true, startAt };
}

function parseScheduleType(value: unknown): "INTERVAL" | "CRON" | null {
  if (value === undefined || value === "INTERVAL") {
    return "INTERVAL";
  }

  return value === "CRON" ? "CRON" : null;
}

function parseName(value: unknown) {
  if (value === undefined) {
    return { ok: true as const, name: undefined };
  }

  if (typeof value !== "string") {
    return invalidRule(
      "INVALID_SCHEDULE_NAME",
      `name must be a non-empty string with at most ${MAX_SCHEDULE_NAME_LENGTH} characters`,
    );
  }

  const name = value.trim();

  if (!name || name.length > MAX_SCHEDULE_NAME_LENGTH) {
    return invalidRule(
      "INVALID_SCHEDULE_NAME",
      `name must be a non-empty string with at most ${MAX_SCHEDULE_NAME_LENGTH} characters`,
    );
  }

  return { ok: true as const, name };
}

function parseIntervalRule(
  body: Record<string, unknown>,
  startAt: Date | undefined,
): ParsedScheduleBody {
  if (body.cronExpression !== undefined || body.timezone !== undefined) {
    return invalidRule(
      "INVALID_SCHEDULE_RULE",
      "INTERVAL schedules must not include cronExpression or timezone",
    );
  }

  const intervalSeconds = body.intervalSeconds;

  if (
    typeof intervalSeconds !== "number" ||
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < MIN_INTERVAL_SECONDS ||
    intervalSeconds > MAX_INTERVAL_SECONDS
  ) {
    return invalidRule(
      "INVALID_INTERVAL_SECONDS",
      `intervalSeconds must be an integer between ${MIN_INTERVAL_SECONDS} and ${MAX_INTERVAL_SECONDS}`,
    );
  }

  return {
    ok: true,
    body,
    name: undefined,
    rule: {
      scheduleType: "INTERVAL",
      intervalSeconds,
      cronExpression: null,
      timezone: "UTC",
      nextRunAt: startAt ?? new Date(Date.now() + intervalSeconds * 1000),
    },
  };
}

function parseCronRule(
  body: Record<string, unknown>,
  startAt: Date | undefined,
): ParsedScheduleBody {
  if (body.intervalSeconds !== undefined) {
    return invalidRule("INVALID_SCHEDULE_RULE", "CRON schedules must not include intervalSeconds");
  }

  const cronSchedule = parseCronSchedule({
    expression: body.cronExpression,
    timezone: body.timezone,
  });

  if (!cronSchedule) {
    return invalidRule("INVALID_CRON_SCHEDULE", INVALID_CRON_MESSAGE);
  }

  try {
    return {
      ok: true,
      body,
      name: undefined,
      rule: {
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: cronSchedule.expression,
        timezone: cronSchedule.timezone,
        nextRunAt: getNextCronRunAt(
          cronSchedule,
          startAt ? new Date(startAt.getTime() - 1) : new Date(),
        ),
      },
    };
  } catch {
    return invalidRule("INVALID_CRON_SCHEDULE", INVALID_CRON_MESSAGE);
  }
}

export function parseTaskScheduleBody(body: unknown): ParsedScheduleBody {
  if (!isRecord(body)) {
    return invalidRule("INVALID_BODY", "Body must be an object");
  }

  const scheduleType = parseScheduleType(body.scheduleType);

  if (!scheduleType) {
    return invalidRule("INVALID_SCHEDULE_TYPE", "scheduleType must be INTERVAL or CRON");
  }

  const parsedName = parseName(body.name);

  if (!parsedName.ok) {
    return parsedName;
  }

  const parsedStartAt = parseStartAt(body.startAt);

  if (!parsedStartAt.ok) {
    return invalidRule("INVALID_START_AT", parsedStartAt.message);
  }

  const parsedRule =
    scheduleType === "INTERVAL"
      ? parseIntervalRule(body, parsedStartAt.startAt)
      : parseCronRule(body, parsedStartAt.startAt);

  if (!parsedRule.ok) {
    return parsedRule;
  }

  return {
    ...parsedRule,
    name: parsedName.name,
  };
}
