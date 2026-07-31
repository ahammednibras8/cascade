import { prisma } from "@cascade/database";
import { deploymentRunnerConfig } from "./config.js";
import { reconcileDeployments } from "./reconcile-deployments.js";

let shuttingDown = false;

function requestShutdown() {
  shuttingDown = true;
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

  while (!shuttingDown) {
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  clearInterval(interval);

  await prisma.$disconnect();

  process.stdout.write("Deployment runner stopped\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
