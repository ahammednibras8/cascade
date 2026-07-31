/* eslint-disable no-await-in-loop */

import { packageName } from "@cascade/core";
import { prisma } from "@cascade/database";
import { WORKER_CONCURRENCY } from "./config.js";
import type { ShutdownSignal } from "./lifecycle/shutdown.js";
import { enqueueTaskRun, popTaskRunMessage, taskRunQueueRedis } from "./queue/task-runs.js";
import { processTaskRun } from "./task-run-processor.js";
import { startTaskScheduleScheduler } from "./timers/task-schedule-scheduler.js";
import { startStuckRunSweeper } from "./timers/stuck-run-sweeper.js";
import { startPendingRunSweeper } from "./timers/pending-run-sweeper.js";
import { loadTaskRegistry } from "./tasks/load-registry.js";

const inFlight = new Set<Promise<void>>();

function trackInFlightTask(task: Promise<void>) {
  inFlight.add(task);

  void task.finally(() => {
    inFlight.delete(task);
  });
}

async function waitForAvailableWorkerSlot() {
  if (inFlight.size < WORKER_CONCURRENCY) {
    return;
  }

  await Promise.race(inFlight);
}

export async function runWorker(shutdownSignal: ShutdownSignal) {
  process.stdout.write(`Starting worker with ${packageName}\n`);

  const taskRegistry = await loadTaskRegistry();

  const stopStuckRunSweeper = startStuckRunSweeper();
  const stopPendingRunSweeper = startPendingRunSweeper();
  const stopTaskScheduleScheduler = startTaskScheduleScheduler();

  try {
    while (true) {
      if (shutdownSignal.isShuttingDown()) {
        break;
      }

      await waitForAvailableWorkerSlot();

      const message = await popTaskRunMessage();

      if (!message) {
        continue;
      }

      if (shutdownSignal.isShuttingDown()) {
        await enqueueTaskRun(message);
        break;
      }

      const task = processTaskRun(message, taskRegistry).catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      });

      trackInFlightTask(task);
    }

    await Promise.allSettled(inFlight);
  } finally {
    stopStuckRunSweeper();
    stopPendingRunSweeper();
    stopTaskScheduleScheduler();

    await taskRunQueueRedis.quit();
    await prisma.$disconnect();

    process.stdout.write("Worker stopped\n");
  }
}
