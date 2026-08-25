import { sweepDueTaskSchedules } from "../scheduler/task-schedules.js";
import { clearInterval } from "node:timers";

const TASK_SCHEDULE_SWEEP_INTERVAL_MS = 5_000;

export function startTaskScheduleScheduler() {
  let currentSweep: Promise<void> | undefined;

  function runTaskScheduleSweep() {
    currentSweep = (async () => {
      await sweepDueTaskSchedules();
    })().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    });
  }

  const interval = setInterval(runTaskScheduleSweep, TASK_SCHEDULE_SWEEP_INTERVAL_MS);
  interval.unref();

  return async () => {
    clearInterval(interval);
    await currentSweep;
  };
}
