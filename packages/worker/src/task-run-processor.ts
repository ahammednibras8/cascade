import { packageName, type JsonValue } from "@cascade/core";
import { Prisma, prisma } from "@cascade/database";
import { enqueueTaskRun, type TaskRunQueueMessage } from "./queue/task-runs.js";
import { getRetryDelayMs } from "./retry.js";
import { createTaskLogger } from "./task-run-logger.js";
import { taskRegistry } from "./tasks/registry.js";
import { startTaskRunHeartbeat } from "./timers/task-run-heartbeat.js";

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

export async function processTaskRun(message: TaskRunQueueMessage) {
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
      delayUntil: true,
      task: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  });

  if (!taskRun) {
    process.stderr.write(`TaskRun not found: ${message.runId}\n`);
    return;
  }

  if (taskRun.status !== "PENDING") {
    return;
  }

  if (taskRun.delayUntil && taskRun.delayUntil > new Date()) {
    await enqueueTaskRun(message, {
      delayMs: taskRun.delayUntil.getTime() - Date.now(),
    });

    return;
  }

  const attempt = await prisma.$transaction(async (tx) => {
    const startedAt = new Date();

    const claim = await tx.taskRun.updateMany({
      where: {
        id: taskRun.id,
        status: "PENDING",
        OR: [
          {
            delayUntil: null,
          },
          {
            delayUntil: {
              lte: startedAt,
            },
          },
        ],
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
    process.stderr.write(`TaskRun ${taskRun.id} was already claimed; skipping\n`);
    return;
  }

  const localTask = taskRegistry.get(taskRun.task.slug);

  if (!localTask) {
    await prisma.$transaction(async (tx) => {
      const completedAt = new Date();

      const error = {
        code: "TASK_NOT_REGISTERED",
        message: `No local task registered for slug: ${taskRun.task.slug}`,
      };

      const updateRun = await tx.taskRun.updateMany({
        where: {
          id: taskRun.id,
          status: "EXECUTING",
        },
        data: {
          status: "FAILED",
          output: Prisma.DbNull,
          error,
          lastHeartbeatAt: completedAt,
          completedAt,
        },
      });

      if (updateRun.count !== 1) {
        return;
      }

      await tx.taskAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: "FAILED",
          error,
          completedAt,
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

  process.stdout.write(`Running task ${taskRun.task.slug} (${taskRun.id})\n`);

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

    const completed = await prisma.$transaction(async (tx) => {
      const completedAt = new Date();

      const updateRun = await tx.taskRun.updateMany({
        where: {
          id: taskRun.id,
          status: "EXECUTING",
        },
        data: {
          status: "COMPLETED",
          output: normalizedOutput,
          error: Prisma.DbNull,
          lastHeartbeatAt: completedAt,
          completedAt,
        },
      });

      if (updateRun.count !== 1) {
        return false;
      }

      await tx.taskAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: "COMPLETED",
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

      return true;
    });

    if (!completed) {
      return;
    }
  } catch (error) {
    const serializedError = serializeError(error);
    const shouldRetry = attempt.attemptNumber < localTask.retry.maxAttempts;
    const retryDelayMs = shouldRetry ? getRetryDelayMs(attempt.attemptNumber, localTask.retry) : 0;

    if (shouldRetry) {
      const retried = await prisma.$transaction(async (tx) => {
        const failedAt = new Date();

        const updateRun = await tx.taskRun.updateMany({
          where: {
            id: taskRun.id,
            status: "EXECUTING",
          },
          data: {
            status: "PENDING",
            output: Prisma.DbNull,
            error: serializedError,
            lastHeartbeatAt: null,
            completedAt: null,
          },
        });

        if (updateRun.count !== 1) {
          return false;
        }

        await tx.taskAttempt.update({
          where: {
            id: attempt.id,
          },
          data: {
            status: "FAILED",
            error: serializedError,
            completedAt: failedAt,
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

        return true;
      });

      if (!retried) {
        return;
      }

      await enqueueTaskRun(message, {
        delayMs: retryDelayMs,
      });

      return;
    }

    const failed = await prisma.$transaction(async (tx) => {
      const completedAt = new Date();

      const updateRun = await tx.taskRun.updateMany({
        where: {
          id: taskRun.id,
          status: "EXECUTING",
        },
        data: {
          status: "FAILED",
          output: Prisma.DbNull,
          error: serializedError,
          lastHeartbeatAt: completedAt,
          completedAt,
        },
      });

      if (updateRun.count !== 1) {
        return false;
      }

      await tx.taskAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: "FAILED",
          error: serializedError,
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

      return true;
    });

    if (!failed) {
      return;
    }
  } finally {
    stopHeartbeat();
  }
}
