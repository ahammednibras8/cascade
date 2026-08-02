import { prisma } from "@cascade/database";
import { deploymentRunnerConfig } from "./config.js";
import { reconcileDeployments } from "./reconcile-deployments.js";
import { shutdownTelemetry } from "@cascade/telemetry";

let shuttingDown = false;
let resolveShutdown: (() => void) | undefined;

const shutdown = new Promise<void>((resolve) => {
  resolveShutdown = resolve;
});

function requestShutdown() {
  shuttingDown = true;
  resolveShutdown?.();
}

process.on("SIGINT", requestShutdown);
process.on("SIGTERM", requestShutdown);

async function runReconcilation() {
  try {
    await reconcileDeployments();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  }
}

async function main() {
  process.stdout.write("Starting Cascade deployment runner\n");

  await runReconcilation();

  const interval = setInterval(() => {
    if (!shuttingDown) {
      void runReconcilation();
    }
  }, deploymentRunnerConfig.reconcileIntervalMs);

  interval.unref();

  await shutdown;

  clearInterval(interval);

  await prisma.$disconnect();
  await shutdownTelemetry();

  process.stdout.write("Deployment runner stopped\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
