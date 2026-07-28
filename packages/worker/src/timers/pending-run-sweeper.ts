import { PENDING_RUN_SWEEP_INTERVAL_MS } from "../config.js";
import { sweepPendingTaskRuns } from "../sweeper/pending-runs.js";

function runPendingRunSweep() {
  void sweepPendingTaskRuns().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  });
}

export function startPendingRunSweeper() {
  runPendingRunSweep();

  const interval = setInterval(runPendingRunSweep, PENDING_RUN_SWEEP_INTERVAL_MS);

  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
