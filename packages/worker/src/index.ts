/* eslint-disable no-console */

import { packageName, type JsonValue } from "@cascade/core";
import {
  popTaskRunMessage,
  type TaskRunQueueMessage,
  taskRunQueueRedis,
} from "./queue/task-runs.js";
import { prisma, Prisma } from "@cascade/database";
import { taskRegistry } from "./tasks/registry.js";

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
    console.warn(`TaskRun ${taskRun.id} is ${taskRun.status}; skipping`);
    return;
  }

  const localTask = taskRegistry.get(taskRun.task.slug);

  if (!localTask) {
    await prisma.$transaction(async (tx) => {
      await tx.taskRun.update({
        where: {
          id: taskRun.id,
        },
        data: {
          status: "FAILED",
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

  const attempt = await prisma.$transaction(async (tx) => {
    const claim = await tx.taskRun.updateMany({
      where: {
        id: taskRun.id,
        status: "PENDING",
      },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
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
        status: "RUNNING",
        startedAt: new Date(),
      },
      select: {
        id: true,
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

  console.log(`Running task ${taskRun.task.slug} (${taskRun.id})`);

  try {
    const output = await localTask.run({
      runId: taskRun.id,
      taskId: taskRun.taskId,
      environmentId: message.environmentId,
      payload: taskRun.payload as JsonValue | null,
    });

    const normalizedOutput = output === undefined ? { ok: true } : output;

    await prisma.$transaction(async (tx) => {
      await tx.taskAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
        },
      });

      await tx.taskRun.update({
        where: {
          id: taskRun.id,
        },
        data: {
          status: "SUCCEEDED",
          output: normalizedOutput as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      await tx.taskEvent.create({
        data: {
          taskRunId: taskRun.id,
          taskAttemptId: attempt.id,
          type: "task.run.succeeded",
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
          status: "FAILED",
          error: serializedError,
          completedAt: new Date(),
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
  }
}

async function main() {
  console.log(`Starting worker with ${packageName}`);

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

  await taskRunQueueRedis.quit();
  await prisma.$disconnect();

  console.log("Worker stopped");
}

main().catch(async (error: unknown) => {
  console.error(error);

  await taskRunQueueRedis.quit();
  await prisma.$disconnect();

  process.exitCode = 1;
});
