import { expect } from "vitest";
import {
  ATTEMPT_ID,
  RUN_ID,
  TRACE_ID,
  releaseQueueConcurrency,
  startQueueConcurrencyLeaseHeartbeat,
  stopHeartbeat,
  stopQueueConcurrencyHeartbeat,
  txTaskAttemptCreate,
  txTaskAttemptUpdate,
  txTaskRunUpdateMany,
} from "./harness.js";

export function expectTaskRunWasClaimedForExecution() {
  expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      where: expect.objectContaining({
        id: RUN_ID,
        status: "PENDING",
      }),
      data: expect.objectContaining({
        status: "EXECUTING",
        lastHeartbeatAt: expect.any(Date),
        traceId: TRACE_ID,
      }),
    }),
  );
}

export function expectTaskAttemptWasStarted(attemptNumber = 1) {
  expect(txTaskAttemptCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        taskRunId: RUN_ID,
        attemptNumber,
        status: "EXECUTING",
        startedAt: expect.any(Date),
      }),
    }),
  );
}

export function expectHeartbeatWasStopped() {
  expect(stopHeartbeat).toHaveBeenCalledOnce();
  expect(startQueueConcurrencyLeaseHeartbeat).not.toHaveBeenCalled();
  expect(stopQueueConcurrencyHeartbeat).not.toHaveBeenCalled();
  expect(releaseQueueConcurrency).not.toHaveBeenCalled();
}

export function expectTaskRunWasCompletedWithOutput(output: unknown) {
  expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      where: {
        id: RUN_ID,
        status: "EXECUTING",
      },
      data: expect.objectContaining({
        status: "COMPLETED",
        output,
        error: "DB_NULL",
        completedAt: expect.any(Date),
      }),
    }),
  );
}

export function expectTaskAttemptWasCompleted() {
  expect(txTaskAttemptUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: ATTEMPT_ID,
      },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedAt: expect.any(Date),
      }),
    }),
  );
}

export function expectTaskRunWasFailed(message: string) {
  expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      where: {
        id: RUN_ID,
        status: "EXECUTING",
      },
      data: expect.objectContaining({
        status: "FAILED",
        output: "DB_NULL",
        error: expect.objectContaining({
          name: "Error",
          message,
        }),
        completedAt: expect.any(Date),
      }),
    }),
  );
}

export function expectTaskAttemptWasFailed(message: string) {
  expect(txTaskAttemptUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: ATTEMPT_ID,
      },
      data: expect.objectContaining({
        status: "FAILED",
        error: expect.objectContaining({
          name: "Error",
          message,
        }),
        completedAt: expect.any(Date),
      }),
    }),
  );
}
