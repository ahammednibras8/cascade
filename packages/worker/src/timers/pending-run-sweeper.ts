import { PENDING_RUN_SWEEP_INTERVAL_MS } from "../config.js";
import { sweepPendingTaskRuns } from "../sweeper/pending-runs.js";

export function startPendingRunSweeper() {
  let currentSweep: Promise<void> | undefined;

  function runPendingRunSweep() {
    currentSweep = (async () => {
      await sweepPendingTaskRuns();
    })().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    });
  }

  runPendingRunSweep();

  const interval = setInterval(runPendingRunSweep, PENDING_RUN_SWEEP_INTERVAL_MS);
  interval.unref();

  return async () => {
    clearInterval(interval);
    await currentSweep;
  };
}
