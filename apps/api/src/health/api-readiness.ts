import { prisma } from "@cascade/database";
import { taskRunQueueRedis } from "../queue/task-runs.js";

const DEFAULT_DEPENDENCY_TIMEOUT_MS = 2_000;

type DependencyStatus = "ok" | "unavailable";

export type ApiReadiness = {
  ok: boolean;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
};

function getDependencyTimeoutMs() {
  const rawValue = process.env.HEALTHCHECK_DEPENDENCY_TIMEOUT_MS;

  if (rawValue === undefined) {
    return DEFAULT_DEPENDENCY_TIMEOUT_MS;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("HEALTHCHECK_DEPENDENCY_TIMEOUT_MS must be a positive integer");
  }

  return value;
}

async function withTimeout(operation: Promise<unknown>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Dependency health check timed out"));
        }, timeoutMs);

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

export async function checkApiReadiness(): Promise<ApiReadiness> {
  const timeoutMs = getDependencyTimeoutMs();

  const [database, redis] = await Promise.all([
    withTimeout(prisma.$queryRaw`SELECT 1`, timeoutMs),
    withTimeout(taskRunQueueRedis.ping(), timeoutMs),
  ]);

  return {
    ok: database === "ok" && redis === "ok",
    dependencies: {
      database,
      redis,
    },
  };
}
