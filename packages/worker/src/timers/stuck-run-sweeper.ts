import { sweepStuckTaskRuns } from "../sweeper/stuck-runs.js";

const STUCK_RUN_SWEEP_INTERVAL_MS = 10_000;

export function startStuckRunSweeper() {
  const interval = setInterval(() => {
    void sweepStuckTaskRuns().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    });
  }, STUCK_RUN_SWEEP_INTERVAL_MS);

  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
