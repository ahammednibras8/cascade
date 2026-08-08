import { shutdownTelemetry } from "@cascade/telemetry";
import { createShutdownSignal } from "./lifecycle/shutdown.js";
import { runWorker } from "./worker.js";
import { createWorkerHealthState } from "./health/state.js";
import { startWorkerHealthServer, stopWorkerHealthServer } from "./health/server.js";

async function main() {
  try {
    const healthState = createWorkerHealthState();
    const shutdownSignal = createShutdownSignal(() => {
      healthState.markShuttingDown();
    });

    const healthServer = await startWorkerHealthServer(healthState);

    try {
      await runWorker(shutdownSignal, healthState);
    } finally {
      healthState.markShuttingDown();
      await stopWorkerHealthServer(healthServer);
    }
  } finally {
    await shutdownTelemetry();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
