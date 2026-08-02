import { expect } from "vitest";
import type { TriggerTaskRunResult } from "../../../src/services/trigger-task-run.js";
import {
  auth,
  CREATED_AT,
  enqueueTaskRun,
  EXECUTION_CONFIG,
  maybeStoreJsonValue,
  prisma,
  RUN_ID,
  SPAN_ID,
  TASK_ID,
  TRACE_ID,
  txTaskEventCreate,
  txTaskRunCreate,
} from "./harness.js";

export function expectFailure(
  result: TriggerTaskRunResult,
  input: {
    status: 400 | 404 | 409;
    code: string;
    message: string;
  },
) {
  expect(result).toEqual({
    ok: false,
    status: input.status,
    error: {
      code: input.code,
      message: input.message,
    },
  });
}

export function expectTriggerSucceeded(result: TriggerTaskRunResult) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected triggerTaskRun to succeed");
  }

  return result;
}

export function expectPendingTaskRunResponse(result: TriggerTaskRunResult) {
  const success = expectTriggerSucceeded(result);

  expect(success.status).toBe(202);
  expect(success.idempotentReplayed).toBe(false);
  expect(success.taskRun).toEqual({
    id: RUN_ID,
    taskId: TASK_ID,
    taskSlug: "hello",
    taskName: "Hello",
    status: "PENDING",
    payload: {
      message: "hello",
    },
    createdAt: CREATED_AT.toISOString(),
    idempotentReplay: false,
    traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
  });

  return success;
}

export function expectTaskLookupById() {
  expect(prisma.task.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: TASK_ID,
        environmentId: auth.environmentId,
      },
    }),
  );
}

export function expectTaskLookupBySlug(slug = "hello") {
  expect(prisma.task.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        slug,
        environmentId: auth.environmentId,
      },
    }),
  );
}

export function expectNoRunCreatedOrQueued() {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(enqueueTaskRun).not.toHaveBeenCalled();
}

export function expectPayloadStored(payload: unknown = { message: "hello" }) {
  expect(maybeStoreJsonValue).toHaveBeenCalledWith({
    kind: "PAYLOAD",
    environmentId: auth.environmentId,
    taskId: TASK_ID,
    runId: RUN_ID,
    value: payload,
  });
}

export function expectTaskRunCreated(data: Record<string, unknown> = {}) {
  expect(txTaskRunCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        id: RUN_ID,
        taskId: TASK_ID,
        status: "PENDING",
        traceId: TRACE_ID,
        triggerSpanId: SPAN_ID,
        deploymentId: "deployment-1",
        executionConfig: EXECUTION_CONFIG,
        payload: {
          message: "hello",
        },
        ...data,
      }),
    }),
  );
}

export function expectTriggerEventWritten(data: Record<string, unknown> = {}) {
  expect(txTaskEventCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        taskRunId: RUN_ID,
        type: "task.triggered",
        level: "INFO",
        message: "Task trigger accepted and run is pending",
        ...data,
      }),
    }),
  );
}

export function expectRunQueued(delayMs = 0) {
  expect(enqueueTaskRun).toHaveBeenCalledWith(
    {
      runId: RUN_ID,
      taskId: TASK_ID,
      environmentId: auth.environmentId,
      deploymentId: "deployment-1",
    },
    {
      delayMs,
    },
  );
}
