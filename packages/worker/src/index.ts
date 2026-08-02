import { shutdownTelemetry } from "@cascade/telemetry";
import { createShutdownSignal } from "./lifecycle/shutdown.js";
import { runWorker } from "./worker.js";

const shutdownSignal = createShutdownSignal();

async function main() {
  try {
    await runWorker(shutdownSignal);
  } finally {
    await shutdownTelemetry();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
