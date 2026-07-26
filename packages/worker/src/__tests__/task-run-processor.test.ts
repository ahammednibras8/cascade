import { beforeEach, describe, expect, it } from "vitest";
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
  txTaskAttemptCreate,
  txTaskEventCreate,
  txTaskRunUpdateMany,
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

    txTaskAttemptCreate.mockResolvedValue(createAttempt(2));
    localTaskRun.mockRejectedValue(new Error("Temporary failure"));

    await processTaskRun(createMessage());

    expectTaskRunWasClaimedForExecution();

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
});
