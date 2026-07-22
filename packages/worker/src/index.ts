import { createShutdownSignal } from "./lifecycle/shutdown.js";
import { runWorker } from "./worker.js";

const shutdownSignal = createShutdownSignal();

runWorker(shutdownSignal).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
