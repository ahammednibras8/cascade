import { beforeEach, describe, expect, it } from "vitest";
import {
  RUN_ID,
  createMessage,
  localTaskRun,
  maybeStoreJsonValue,
  prisma,
  processTaskRun,
  resetTaskRunProcessorHarness,
  startTaskRunHeartbeat,
  stopHeartbeat,
  taskRegistry,
  txTaskAttemptUpdate,
  txTaskRunUpdateMany,
} from "./support/task-run-processor/harness.js";

describe("processTaskRun cancellation", () => {
  beforeEach(() => {
    resetTaskRunProcessorHarness();
  });

  it("does not start the local task when the run is already canceled", async () => {
    prisma.taskRun.findUnique.mockResolvedValueOnce({
      status: "CANCELED",
    });

    await processTaskRun(createMessage(), taskRegistry);

    expect(txTaskRunUpdateMany).toHaveBeenCalledTimes(1);
    expect(localTaskRun).not.toHaveBeenCalled();
    expect(startTaskRunHeartbeat).not.toHaveBeenCalled();
    expect(maybeStoreJsonValue).not.toHaveBeenCalled();
    expect(txTaskAttemptUpdate).not.toHaveBeenCalled();
  });

  it("does not complete the run when cancellation happens after task execution", async () => {
    prisma.taskRun.findUnique
      .mockResolvedValueOnce({
        status: "EXECUTING",
      })
      .mockResolvedValueOnce({
        status: "CANCELED",
      });

    await processTaskRun(createMessage(), taskRegistry);

    expect(localTaskRun).toHaveBeenCalledOnce();
    expect(startTaskRunHeartbeat).toHaveBeenCalledWith(RUN_ID);
    expect(stopHeartbeat).toHaveBeenCalledOnce();

    expect(txTaskRunUpdateMany).toHaveBeenCalledTimes(1);
    expect(maybeStoreJsonValue).not.toHaveBeenCalled();
    expect(txTaskAttemptUpdate).not.toHaveBeenCalled();
  });
});
