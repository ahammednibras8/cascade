import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTEMPT_ID,
  ENVIRONMENT_ID,
  PARENT_SPAN_ID,
  RUN_ID,
  SPAN_ID,
  TASK_ID,
  TRACE_ID,
  createAttempt,
  createMessage,
  enqueueTaskRun,
  localTaskRetry,
  localTaskRun,
  maybeStoreJsonValue,
  prisma,
  processTaskRun,
  resetTaskRunProcessorHarness,
  startTaskRunHeartbeat,
  txTaskAttemptCount,
  txTaskAttemptCreate,
  txTaskEventCreate,
  txTaskRunUpdateMany,
  localTaskQueue,
  releaseQueueConcurrency,
  startQueueConcurrencyLeaseHeartbeat,
  stopQueueConcurrencyHeartbeat,
  tryAcquireQueueConcurrency,
} from "./task-run-processor/harness.js";
import {
  expectHeartbeatWasStopped,
  expectTaskAttemptWasCompleted,
  expectTaskAttemptWasFailed,
  expectTaskAttemptWasStarted,
  expectTaskRunWasClaimedForExecution,
  expectTaskRunWasCompletedWithOutput,
  expectTaskRunWasFailed,
} from "./task-run-processor/assertions.js";

describe("processTaskRun", () => {
  beforeEach(() => {
    resetTaskRunProcessorHarness();
  });

  it("executes the matching local task and completes the run", async () => {
    await processTaskRun(createMessage());

    expect(prisma.taskRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: RUN_ID,
          taskId: TASK_ID,
          task: {
            environmentId: ENVIRONMENT_ID,
          },
        },
      }),
    );

    expectTaskRunWasClaimedForExecution();
    expectTaskAttemptWasStarted();

    expect(startTaskRunHeartbeat).toHaveBeenCalledWith(RUN_ID);

    expect(localTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        taskId: TASK_ID,
        environmentId: ENVIRONMENT_ID,
        payload: {
          message: "hello",
        },
        logger: expect.any(Object),
        signal: expect.any(AbortSignal),
        trace: expect.objectContaining({
          traceId: TRACE_ID,
          spanId: SPAN_ID,
          parentSpanId: PARENT_SPAN_ID,
        }),
      }),
    );

    expect(maybeStoreJsonValue).toHaveBeenCalledWith({
      kind: "OUTPUT",
      environmentId: ENVIRONMENT_ID,
      taskId: RUN_ID,
      runId: RUN_ID,
      value: {
        ok: true,
      },
    });

    expectTaskRunWasCompletedWithOutput({
      ok: true,
    });
    expectTaskAttemptWasCompleted();

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.completed",
          level: "INFO",
          message: "Task run completed successfully",
        }),
      }),
    );

    expectHeartbeatWasStopped();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("marks the run failed when the matching local task throws", async () => {
    localTaskRun.mockRejectedValue(new Error("Task exploded"));

    await processTaskRun(createMessage());

    expectTaskRunWasClaimedForExecution();
    expectTaskRunWasFailed("Task exploded");
    expectTaskAttemptWasFailed("Task exploded");

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.failed",
          level: "ERROR",
          message: "Task run failed",
        }),
      }),
    );

    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("stores DbNull when the local task returns undefined", async () => {
    localTaskRun.mockResolvedValue(undefined);

    await processTaskRun(createMessage());

    expect(maybeStoreJsonValue).not.toHaveBeenCalled();
    expectTaskRunWasCompletedWithOutput("DB_NULL");
    expectTaskAttemptWasCompleted();
  });

  it("retries a failed task when attempts remain", async () => {
    localTaskRetry.maxAttempts = 3;
    localTaskRetry.delayMs = 1000;
    localTaskRetry.exponentialBackoff = true;

    txTaskAttemptCount.mockResolvedValue(1);
    txTaskAttemptCreate.mockResolvedValue(createAttempt(2));
    localTaskRun.mockRejectedValue(new Error("Temporary failure"));

    await processTaskRun(createMessage());

    expectTaskRunWasClaimedForExecution();
    expectTaskAttemptWasStarted(2);

    expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: RUN_ID,
          status: "EXECUTING",
        },
        data: expect.objectContaining({
          status: "PENDING",
          output: "DB_NULL",
          error: expect.objectContaining({
            name: "Error",
            message: "Temporary failure",
          }),
          lastHeartbeatAt: null,
          completedAt: null,
        }),
      }),
    );

    expectTaskAttemptWasFailed("Temporary failure");

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.retry.scheduled",
          level: "WARN",
          message: "Task run failed and retry was scheduled",
          data: expect.objectContaining({
            attemptNumber: 2,
            nextAttemptNumber: 3,
            maxAttempts: 3,
            delayMs: 2000,
            error: expect.objectContaining({
              name: "Error",
              message: "Temporary failure",
            }),
          }),
        }),
      }),
    );

    expect(enqueueTaskRun).toHaveBeenCalledWith(createMessage(), {
      delayMs: 2000,
    });
  });

  it("does not execute a run before delayUntil", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    try {
      const delayUntil = new Date("2026-01-01T00:01:00.000Z");

      prisma.taskRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        taskId: TASK_ID,
        status: "PENDING",
        payload: {
          message: "hello",
        },
        delayUntil,
        traceId: TRACE_ID,
        triggerSpanId: PARENT_SPAN_ID,
        task: {
          slug: "hello",
          name: "Hello",
        },
      });

      await processTaskRun(createMessage());

      expect(enqueueTaskRun).toHaveBeenCalledWith(createMessage(), {
        delayMs: 60_000,
      });

      expect(txTaskRunUpdateMany).not.toHaveBeenCalled();
      expect(localTaskRun).not.toHaveBeenCalled();
      expect(startTaskRunHeartbeat).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("requeues without executing when queue concurrency limit is reached", async () => {
    localTaskQueue.concurrencyLimit = 1;
    tryAcquireQueueConcurrency.mockResolvedValue(null);

    await processTaskRun(createMessage());

    expect(tryAcquireQueueConcurrency).toHaveBeenCalledWith({
      environmentId: ENVIRONMENT_ID,
      queueName: "hello",
      runId: RUN_ID,
      limit: 1,
    });

    expect(enqueueTaskRun).toHaveBeenCalledWith(createMessage(), {
      delayMs: 1000,
    });

    expect(txTaskRunUpdateMany).not.toHaveBeenCalled();
    expect(localTaskRun).not.toHaveBeenCalled();
    expect(startTaskRunHeartbeat).not.toHaveBeenCalled();
    expect(startQueueConcurrencyLeaseHeartbeat).not.toHaveBeenCalled();
    expect(releaseQueueConcurrency).not.toHaveBeenCalled();
  });

  it("executes with a queue concurrency lease and releases it after completion", async () => {
    const lease = {
      key: "cascade:queue-concurrency:environment-1:hello",
      token: "run-1:lease-token",
      ttlMs: 60_000,
    };

    localTaskQueue.concurrencyLimit = 1;
    tryAcquireQueueConcurrency.mockResolvedValue(lease);

    await processTaskRun(createMessage());

    expect(tryAcquireQueueConcurrency).toHaveBeenCalledWith({
      environmentId: ENVIRONMENT_ID,
      queueName: "hello",
      runId: RUN_ID,
      limit: 1,
    });

    expect(startQueueConcurrencyLeaseHeartbeat).toHaveBeenCalledWith(lease);
    expect(localTaskRun).toHaveBeenCalledOnce();

    expectTaskRunWasClaimedForExecution();
    expectTaskRunWasCompletedWithOutput({
      ok: true,
    });

    expect(stopQueueConcurrencyHeartbeat).toHaveBeenCalledOnce();
    expect(releaseQueueConcurrency).toHaveBeenCalledWith(lease);
  });
});
