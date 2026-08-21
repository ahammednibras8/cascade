/* eslint-disable no-await-in-loop */

import { packageName } from "@cascade/core";
import { prisma } from "@cascade/database";
import { WORKER_CONCURRENCY, WORKER_ROLE } from "./config.js";
import type { ShutdownSignal } from "./lifecycle/shutdown.js";
import { disconnectTaskRunQueueRedis, popTaskRunMessage } from "./queue/task-runs.js";
import { processTaskRun } from "./task-run-processor.js";
import { startTaskScheduleScheduler } from "./timers/task-schedule-scheduler.js";
import { startStuckRunSweeper } from "./timers/stuck-run-sweeper.js";
import { startPendingRunSweeper } from "./timers/pending-run-sweeper.js";
import { loadTaskRegistry } from "./tasks/load-registry.js";
import type { WorkerHealthState } from "./health/state.js";
import { startRunEventOutboxDispatcher } from "./timers/run-event-outbox-dispatcher.js";

const inFlight = new Set<Promise<void>>();
type StopWorkerTimer = () => void | Promise<void>;

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

function isControlWorker() {
  return WORKER_ROLE === "control";
}

function isQueueWorker() {
  return WORKER_ROLE === "deployment" || WORKER_ROLE === "local";
}

function startControlTimers(): StopWorkerTimer[] {
  if (!isControlWorker()) {
    return [];
  }

  return [
    startStuckRunSweeper(),
    startPendingRunSweeper(),
    startTaskScheduleScheduler(),
    startRunEventOutboxDispatcher(),
  ];
}

async function stopWorkerTimers(stoppers: StopWorkerTimer[]) {
  await Promise.allSettled(stoppers.map((stop) => stop()));
}

async function popMessageUntilShutdown(shutdownSignal: ShutdownSignal) {
  try {
    return await popTaskRunMessage();
  } catch (error) {
    if (shutdownSignal.isShuttingDown()) {
      return null;
    }

    throw error;
  }
}

function startTaskProcessing(
  message: NonNullable<Awaited<ReturnType<typeof popTaskRunMessage>>>,
  taskRegistry: Awaited<ReturnType<typeof loadTaskRegistry>>,
) {
  const task = processTaskRun(message, taskRegistry).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  });

  trackInFlightTask(task);
}

async function runQueueWorker(shutdownSignal: ShutdownSignal, healthState?: WorkerHealthState) {
  const taskRegistry = await loadTaskRegistry();

  healthState?.markReady();

  while (!shutdownSignal.isShuttingDown()) {
    await waitForAvailableWorkerSlot();

    const message = await popMessageUntilShutdown(shutdownSignal);

    if (!message) {
      continue;
    }

    startTaskProcessing(message, taskRegistry);
  }

  await Promise.allSettled(inFlight);
}

async function runControlWorker(shutdownSignal: ShutdownSignal, healthState?: WorkerHealthState) {
  healthState?.markReady();
  await waitForShutdown(shutdownSignal);
}

async function shutdownWorker(stoppers: StopWorkerTimer[], healthState?: WorkerHealthState) {
  healthState?.markShuttingDown();

  await stopWorkerTimers(stoppers);

  disconnectTaskRunQueueRedis();
  await prisma.$disconnect();

  process.stdout.write("Worker stopped\n");
}

export async function runWorker(shutdownSignal: ShutdownSignal, healthState?: WorkerHealthState) {
  process.stdout.write(`Starting ${WORKER_ROLE} worker with ${packageName}\n`);

  const timerStoppers = startControlTimers();

  try {
    if (isQueueWorker()) {
      await runQueueWorker(shutdownSignal, healthState);
      return;
    }

    await runControlWorker(shutdownSignal, healthState);
  } finally {
    await shutdownWorker(timerStoppers, healthState);
  }
}
