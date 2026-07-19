/* eslint-disable no-console */

import { packageName, type JsonValue, type TaskLogLevel } from "@cascade/core";
import {
  enqueueTaskRun,
  popTaskRunMessage,
  type TaskRunQueueMessage,
  taskRunQueueRedis,
} from "./queue/task-runs.js";
import { prisma, Prisma } from "@cascade/database";
import { taskRegistry } from "./tasks/registry.js";
import { clearInterval } from "node:timers";
import { getRetryDelayMs } from "./retry.js";
import { sweepStuckTaskRuns } from "./sweeper/stuck-runs.js";

const HEARTBEAT_INTERVAL_MS = 5_000;
const STUCK_RUN_SWEEP_INTERVAL_MS = 10_000;

let isShuttingDown = false;

process.on("SIGINT", () => {
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
});

function serializeError(error: unknown): Prisma.InputJsonValue {
  if (error instanceof Error) {
    const data: Record<string, string> = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) {
      data.stack = error.stack;
    }

    return data;
  }

  return {
    message: String(error),
  };
}

function createTaskLogger(input: { taskRunId: string; taskAttemptId: string }) {
  async function log(level: TaskLogLevel, message: string, data?: JsonValue) {
    await prisma.taskEvent.create({
      data: {
        taskRunId: input.taskRunId,
        taskAttemptId: input.taskAttemptId,
        type: "task.log",
        level,
        message,
        ...(data === undefined ? {} : { data: data as Prisma.InputJsonValue }),
      },
    });
  }

  return {
    debug(message: string, data?: JsonValue) {
      return log("DEBUG", message, data);
    },

    info(message: string, data?: JsonValue) {
      return log("INFO", message, data);
    },

    warn(message: string, data?: JsonValue) {
      return log("WARN", message, data);
    },

    error(message: string, data?: JsonValue) {
      return log("ERROR", message, data);
    },
  };
}

function startTaskRunHeartbeat(taskRunId: string) {
  const interval = setInterval(() => {
    void prisma.taskRun
      .updateMany({
        where: {
          id: taskRunId,
          status: "EXECUTING",
        },
        data: {
          lastHeartbeatAt: new Date(),
        },
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();

  return () => {
    clearInterval(interval);
  };
}

function startStuckRunSweeper() {
  const interval = setInterval(() => {
    void sweepStuckTaskRuns().catch((error: unknown) => {
      console.error(error);
    });
  }, STUCK_RUN_SWEEP_INTERVAL_MS);

  interval.unref();

  return () => {
    clearInterval(interval);
  };
}

async function processTaskRun(message: TaskRunQueueMessage) {
  const taskRun = await prisma.taskRun.findFirst({
    where: {
      id: message.runId,
      taskId: message.taskId,
      task: {
        environmentId: message.environmentId,
      },
    },
    select: {
      id: true,
      taskId: true,
      status: true,
      payload: true,
      task: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  });

  if (!taskRun) {
    console.warn(`TaskRun not found: ${message.runId}`);
    return;
  }

  if (taskRun.status !== "PENDING") {
    return;
  }

  const attempt = await prisma.$transaction(async (tx) => {
    const startedAt = new Date();

    const claim = await tx.taskRun.updateMany({
      where: {
        id: taskRun.id,
        status: "PENDING",
      },
      data: {
        status: "EXECUTING",
        startedAt,
        lastHeartbeatAt: startedAt,
        completedAt: null,
        output: Prisma.DbNull,
        error: Prisma.DbNull,
      },
    });

    if (claim.count !== 1) {
      return null;
    }

    const previousAttempts = await tx.taskAttempt.count({
      where: {
        taskRunId: taskRun.id,
      },
    });

    const createdAttempt = await tx.taskAttempt.create({
      data: {
        taskRunId: taskRun.id,
        attemptNumber: previousAttempts + 1,
        status: "EXECUTING",
        startedAt: new Date(),
      },
      select: {
        id: true,
        attemptNumber: true,
      },
    });

    await tx.taskEvent.create({
      data: {
        taskRunId: taskRun.id,
        taskAttemptId: createdAttempt.id,
        type: "task.run.started",
        level: "INFO",
        message: "Task run started by worker",
      },
    });

    return createdAttempt;
  });

  if (!attempt) {
    console.warn(`TaskRun ${taskRun.id} was already claimed; skipping`);
    return;
  }

  const localTask = taskRegistry.get(taskRun.task.slug);

  if (!localTask) {
    await prisma.$transaction(async (tx) => {
      await tx.taskAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: "FAILED",
          error: {
            code: "TASK_NOT_REGISTERED",
            message: `No local task registered for slug: ${taskRun.task.slug}`,
          },
          completedAt: new Date(),
        },
      });

      await tx.taskRun.update({
        where: {
          id: taskRun.id,
        },
        data: {
          status: "FAILED",
          output: Prisma.DbNull,
          error: {
            code: "TASK_NOT_REGISTERED",
            message: `No local task required for slug: ${taskRun.task.slug}`,
          },
          completedAt: new Date(),
        },
      });

      await tx.taskEvent.create({
        data: {
          taskRunId: taskRun.id,
          taskAttemptId: attempt.id,
          type: "task.run.failed",
          level: "ERROR",
          message: "No local task registered for task slug",
          data: {
            taskSlug: taskRun.task.slug,
          },
        },
      });
    });

    return;
  }

  console.log(`Running task ${taskRun.task.slug} (${taskRun.id})`);

  const stopHeartbeat = startTaskRunHeartbeat(taskRun.id);

  try {
    const logger = createTaskLogger({
      taskRunId: taskRun.id,
      taskAttemptId: attempt.id,
    });

    const output = await localTask.run({
      runId: taskRun.id,
      taskId: taskRun.taskId,
      environmentId: message.environmentId,
      payload: taskRun.payload as JsonValue | null,
      logger,
    });

    const normalizedOutput =
      output === undefined ? Prisma.DbNull : (output as Prisma.InputJsonValue);

    await prisma.$transaction(async (tx) => {
      await tx.taskAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      const completedAt = new Date();

      await tx.taskRun.update({
        where: {
          id: taskRun.id,
        },
        data: {
          status: "COMPLETED",
          output: normalizedOutput,
          error: Prisma.DbNull,
          lastHeartbeatAt: completedAt,
          completedAt,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskRunId: taskRun.id,
          taskAttemptId: attempt.id,
          type: "task.run.completed",
          level: "INFO",
          message: "Task run completed successfully",
          data: {
            worker: packageName,
            taskId: localTask.id,
          },
        },
      });
    });
  } catch (error) {
    const serializedError = serializeError(error);
    const shouldRetry = attempt.attemptNumber < localTask.retry.maxAttempts;
    const retryDelayMs = shouldRetry ? getRetryDelayMs(attempt.attemptNumber, localTask.retry) : 0;

    if (shouldRetry) {
      await prisma.$transaction(async (tx) => {
        await tx.taskAttempt.update({
          where: {
            id: attempt.id,
          },
          data: {
            status: "FAILED",
            error: serializedError,
            completedAt: new Date(),
          },
        });

        await tx.taskRun.update({
          where: {
            id: taskRun.id,
          },
          data: {
            status: "PENDING",
            output: Prisma.DbNull,
            error: serializedError,
            lastHeartbeatAt: new Date(),
            completedAt: null,
          },
        });

        await tx.taskEvent.create({
          data: {
            taskRunId: taskRun.id,
            taskAttemptId: attempt.id,
            type: "task.run.retry.scheduled",
            level: "WARN",
            message: "Task run failed and retry was scheduled",
            data: {
              attemptNumber: attempt.attemptNumber,
              nextAttemptNumber: attempt.attemptNumber + 1,
              maxAttempts: localTask.retry.maxAttempts,
              delayMs: retryDelayMs,
              error: serializedError,
            },
          },
        });
      });

      await enqueueTaskRun(message, {
        delayMs: retryDelayMs,
      });

      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: "FAILED",
          error: serializedError,
          completedAt: new Date(),
        },
      });

      const completedAt = new Date();

      await tx.taskRun.update({
        where: {
          id: taskRun.id,
        },
        data: {
          status: "FAILED",
          output: Prisma.DbNull,
          error: serializedError,
          lastHeartbeatAt: completedAt,
          completedAt,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskRunId: taskRun.id,
          taskAttemptId: attempt.id,
          type: "task.run.failed",
          level: "ERROR",
          message: "Task run failed",
          data: serializedError,
        },
      });
    });
  } finally {
    stopHeartbeat();
  }
}

async function main() {
  console.log(`Starting worker with ${packageName}`);

  const stopStuckRunSweeper = startStuckRunSweeper();

  try {
    while (!isShuttingDown) {
      const message = await popTaskRunMessage();

      if (!message) {
        continue;
      }

      try {
        await processTaskRun(message);
      } catch (error) {
        console.error(error);
      }
    }
  } finally {
    stopStuckRunSweeper();

    await taskRunQueueRedis.quit();
    await prisma.$disconnect();

    console.log("Worker stopped");
  }
}

main().catch(async (error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
