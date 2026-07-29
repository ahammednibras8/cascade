import { beforeEach, describe, expect, it } from "vitest";
import {
  ENVIRONMENT_ID,
  RUN_ID,
  createMessage,
  enqueueTaskRun,
  localTaskRun,
  processTaskRun,
  releaseQueueConcurrency,
  resetTaskRunProcessorHarness,
  startQueueConcurrencyLeaseHeartbeat,
  startTaskRunHeartbeat,
  stopQueueConcurrencyHeartbeat,
  taskExecutionConfig,
  txTaskRunUpdateMany,
  tryAcquireQueueConcurrency,
} from "./support/task-run-processor/harness.js";
import {
  expectTaskRunWasClaimedForExecution,
  expectTaskRunWasCompletedWithOutput,
} from "./support/task-run-processor/assertions.js";

describe("processTaskRun queue concurrency", () => {
  beforeEach(() => {
    resetTaskRunProcessorHarness();
  });

  it("requeues without executing when the snapshot queue limit is reached", async () => {
    taskExecutionConfig.queue.concurrencyLimit = 1;
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

  it("executes with a snapshot queue lease and releases it after completion", async () => {
    const lease = {
      key: "cascade:queue-concurrency:environment-1:hello",
      token: "run-1:lease-token",
      ttlMs: 60_000,
    };

    taskExecutionConfig.queue.concurrencyLimit = 1;
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
