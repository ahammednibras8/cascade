import { CronExpressionParser } from "cron-parser";

export const DEFAULT_SCHEDULE_TIMEZONE = "UTC";

export type CronSchedule = {
  expression: string;
  timezone: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function parseCronSchedule(value: unknown): CronSchedule | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.expression !== "string") {
    return null;
  }

  const expression = value.expression.trim().replace(/\s+/g, " ");

  if (expression.split(" ").length !== 5) {
    return null;
  }

  const timezone =
    typeof value.timezone === "string" && value.timezone.trim().length > 0
      ? value.timezone.trim()
      : DEFAULT_SCHEDULE_TIMEZONE;

  if (!isValidTimezone(timezone)) {
    return null;
  }

  try {
    CronExpressionParser.parse(expression, { tz: timezone });

    return {
      expression,
      timezone,
    };
  } catch {
    return null;
  }
}

export function getNextCronRunAt(schedule: CronSchedule, after: Date): Date {
  if (Number.isNaN(after.getTime())) {
    throw new TypeError("after must be a valid Date");
  }

  return CronExpressionParser.parse(schedule.expression, {
    currentDate: after,
    tz: schedule.timezone,
  })
    .next()
    .toDate();
}
