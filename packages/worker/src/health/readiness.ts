import { prisma } from "@cascade/database";
import { HEALTHCHECK_DEPENDENCY_TIMEOUT_MS } from "../config.js";
import type { WorkerHealthState } from "./state.js";
import { taskRunQueueRedis } from "../queue/task-runs.js";

type DependencyStatus = "ok" | "unavailable";

type WorkerStatus = "ready" | "starting" | "shutting_down";

export type WorkerReadiness = {
  ok: boolean;
  worker: WorkerStatus;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
};

async function withTimeout(operation: Promise<unknown>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Dependency health check timed out"));
        }, HEALTHCHECK_DEPENDENCY_TIMEOUT_MS);

        timeout.unref();
      }),
    ]);

    return "ok" as const;
  } catch {
    return "unavailable" as const;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getWorkerStatus(healthState: WorkerHealthState): WorkerStatus {
  if (healthState.isShuttingDown()) {
    return "shutting_down";
  }

  if (healthState.isReady()) {
    return "ready";
  }

  return "starting";
}

export async function checkWorkerReadiness(
  healthState: WorkerHealthState,
): Promise<WorkerReadiness> {
  const worker = getWorkerStatus(healthState);

  const [database, redis] = await Promise.all([
    withTimeout(prisma.$queryRaw`SELECT 1`),
    withTimeout(taskRunQueueRedis.ping()),
  ]);

  return {
    ok: worker === "ready" && database === "ok" && redis === "ok",
    worker,
    dependencies: {
      database,
      redis,
    },
  };
}
