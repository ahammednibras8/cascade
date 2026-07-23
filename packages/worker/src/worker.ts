/* eslint-disable no-await-in-loop */

import { packageName } from "@cascade/core";
import { prisma } from "@cascade/database";
import { popTaskRunMessage, taskRunQueueRedis } from "./queue/task-runs.js";
import { processTaskRun } from "./task-run-processor.js";
import { startStuckRunSweeper } from "./timers/stuck-run-sweeper.js";
import type { ShutdownSignal } from "./lifecycle/shutdown.js";
import { startTaskScheduleScheduler } from "./timers/task-schedule-scheduler.js";

export async function runWorker(shutdownSignal: ShutdownSignal) {
  process.stdout.write(`Starting worker with ${packageName}\n`);

  const stopStuckRunSweeper = startStuckRunSweeper();
  const stopTaskScheduleScheduler = startTaskScheduleScheduler();

  try {
    while (true) {
      if (shutdownSignal.isShuttingDown()) {
        break;
      }

      const message = await popTaskRunMessage();

      if (!message) {
        continue;
      }

      try {
        await processTaskRun(message);
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      }
    }
  } finally {
    stopStuckRunSweeper();
    stopTaskScheduleScheduler();

    await taskRunQueueRedis.quit();
    await prisma.$disconnect();

    process.stdout.write("Worker stopped\n");
  }
}
