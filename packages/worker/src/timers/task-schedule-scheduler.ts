import { sweepDueTaskSchedules } from "../scheduler/task-schedules.js";
import { clearInterval } from "node:timers";

const TASK_SCHEDULE_SWEEP_INTERVAL_MS = 5_000;

export function startTaskScheduleScheduler() {
  const interval = setInterval(() => {
    void sweepDueTaskSchedules().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    });
  }, TASK_SCHEDULE_SWEEP_INTERVAL_MS);

  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
