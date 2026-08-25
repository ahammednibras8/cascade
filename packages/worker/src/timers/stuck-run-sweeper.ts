import { sweepStuckTaskRuns } from "../sweeper/stuck-runs.js";

const STUCK_RUN_SWEEP_INTERVAL_MS = 10_000;

export function startStuckRunSweeper() {
  let currentSweep: Promise<void> | undefined;

  function runStuckRunSweep() {
    currentSweep = (async () => {
      await sweepStuckTaskRuns();
    })().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    });
  }

  const interval = setInterval(runStuckRunSweep, STUCK_RUN_SWEEP_INTERVAL_MS);
  interval.unref();

  return async () => {
    clearInterval(interval);
    await currentSweep;
  };
}
