import { beforeEach, describe, expect, it } from "vitest";
import {
  ATTEMPT_ID,
  RUN_ID,
  createMessage,
  localTaskRun,
  parseTaskExecutionConfig,
  processTaskRun,
  resetTaskRunProcessorHarness,
  txTaskAttemptUpdate,
  txTaskEventCreate,
  txTaskRunUpdateMany,
} from "./support/task-run-processor/harness.js";

describe("processTaskRun execution config", () => {
  beforeEach(() => {
    resetTaskRunProcessorHarness();
  });

  it("fails the run without executing local code when the snapshot is invalid", async () => {
    parseTaskExecutionConfig.mockReturnValueOnce(null);

    await processTaskRun(createMessage());

    expect(localTaskRun).not.toHaveBeenCalled();

    expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: RUN_ID,
          status: "EXECUTING",
        },
        data: expect.objectContaining({
          status: "FAILED",
          error: {
            code: "EXECUTION_CONFIG_MISSING",
            message: "Task run has no valid execution configuration snapshot",
          },
        }),
      }),
    );

    expect(txTaskAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ATTEMPT_ID,
        },
        data: expect.objectContaining({
          status: "FAILED",
          error: {
            code: "EXECUTION_CONFIG_MISSING",
            message: "Task run has no valid execution configuration snapshot",
          },
        }),
      }),
    );

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.failed",
          level: "ERROR",
        }),
      }),
    );
  });
});
