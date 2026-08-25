import type { Schedule } from "./types";

export function formatScheduleDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatScheduleRule(schedule: Schedule) {
  if (schedule.scheduleType === "INTERVAL") {
    return `Every ${schedule.intervalSeconds} seconds`;
  }

  return `${schedule.cronExpression} (${schedule.timezone})`;
}

export function isObjectStorageRef(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "cascadeObjectRef" in value &&
    value.cascadeObjectRef === true
  );
}
