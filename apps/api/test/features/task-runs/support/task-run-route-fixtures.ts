import { RUN_ID, TASK_ID } from "../../support/route-test-app.js";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

export function createCancelTaskRunSuccess() {
  return {
    ok: true,
    status: 200,
    taskRun: {
      id: RUN_ID,
      taskId: TASK_ID,
      status: "CANCELED",
      canceled: true,
      alreadyCanceled: false,
    },
  };
}

export function createReplayTaskRunSuccess() {
  return {
    ok: true,
    status: 202,
    taskRun: {
      id: "33333333-3333-4333-8333-333333333333",
      taskId: TASK_ID,
      status: "PENDING",
      payload: {
        message: "hello",
      },
      createdAt: CREATED_AT,
      replayedFromRunId: RUN_ID,
    },
  };
}
