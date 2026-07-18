/* eslint-disable no-console */

import { packageName } from "@cascade/core";
import { popTaskRunMessage, taskRunQueueRedis } from "./queue/task-runs.js";
import { prisma } from "@cascade/database";

let isShuttingDown = false;

process.on("SIGINT", () => {
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
});

async function processTaskRun(message: { runId: string; taskId: string; environmentId: string }) {
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

  const attempt = await prisma.$transaction(async (tx) => {
    const updateRun = await tx.taskRun.update({
      where: {
        id: taskRun.id,
      },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    const createdAttempt = await tx.taskAttempt.create({
      data: {
        taskRunId: updateRun.id,
        attemptNumber: 1,
        status: "RUNNING",
        startedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    await tx.taskEvent.create({
      data: {
        taskRunId: updateRun.id,
        taskAttemptId: createdAttempt.id,
        type: "task.run.started",
        level: "INFO",
        message: "Task run started by worker",
      },
    });

    return createdAttempt;
  });

  console.log(`Running task ${taskRun.task.slug} (${taskRun.id}`);

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
        output: {
          ok: true,
        },
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
        },
      },
    });
  });
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
