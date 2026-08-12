/* eslint-disable no-await-in-loop */

import { packageName } from "@cascade/core";
import { prisma } from "@cascade/database";
import { WORKER_CONCURRENCY, WORKER_ROLE } from "./config.js";
import type { ShutdownSignal } from "./lifecycle/shutdown.js";
import { popTaskRunMessage, taskRunQueueRedis } from "./queue/task-runs.js";
import { processTaskRun } from "./task-run-processor.js";
import { startTaskScheduleScheduler } from "./timers/task-schedule-scheduler.js";
import { startStuckRunSweeper } from "./timers/stuck-run-sweeper.js";
import { startPendingRunSweeper } from "./timers/pending-run-sweeper.js";
import { loadTaskRegistry } from "./tasks/load-registry.js";
import type { WorkerHealthState } from "./health/state.js";
import { startRunEventOutboxDispatcher } from "./timers/run-event-outbox-dispatcher.js";

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

async function waitForShutdown(shutdownSignal: ShutdownSignal) {
  while (!shutdownSignal.isShuttingDown()) {
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
}

export async function runWorker(shutdownSignal: ShutdownSignal, healthState?: WorkerHealthState) {
  process.stdout.write(`Starting ${WORKER_ROLE} worker with ${packageName}\n`);

  const isControlWorker = WORKER_ROLE === "control";
  const isQueueWorker = WORKER_ROLE === "deployment" || WORKER_ROLE === "local";

  const stopStuckRunSweeper = isControlWorker ? startStuckRunSweeper() : () => {};
  const stopPendingRunSweeper = isControlWorker ? startPendingRunSweeper() : () => {};
  const stopTaskScheduleScheduler = isControlWorker ? startTaskScheduleScheduler() : () => {};
  const stopRunEventOutboxDispatcher = isControlWorker ? startRunEventOutboxDispatcher() : () => {};

  try {
    if (!isQueueWorker) {
      healthState?.markReady();
      await waitForShutdown(shutdownSignal);
      return;
    }

    const taskRegistry = await loadTaskRegistry();

    healthState?.markReady();

    while (!shutdownSignal.isShuttingDown()) {
      await waitForAvailableWorkerSlot();

      const message = await popTaskRunMessage();

      if (!message) {
        continue;
      }

      const task = processTaskRun(message, taskRegistry).catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      });
      trackInFlightTask(task);
    }

    await Promise.allSettled(inFlight);
  } finally {
    healthState?.markShuttingDown();

    stopStuckRunSweeper();
    stopPendingRunSweeper();
    stopTaskScheduleScheduler();
    stopRunEventOutboxDispatcher();

    await taskRunQueueRedis.quit();
    await prisma.$disconnect();

    process.stdout.write("Worker stopped\n");
  }
}
