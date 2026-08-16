import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashTriggerRequest } from "../../../src/lib/idempotency.js";
import {
  expectFailure,
  expectNoRunCreatedOrQueued,
  expectPendingTaskRunResponse,
  expectPayloadStored,
  expectRunQueued,
  expectTaskLookupById,
  expectTaskLookupBySlug,
  expectTaskRunCreated,
  expectTriggerEventWritten,
  expectTriggerSucceeded,
} from "./support/trigger-task-run/assertions.js";
import {
  auth,
  createChildTraceContext,
  createRootTraceContext,
  createTask,
  createTaskRun,
  enqueueTaskRun,
  parseTraceparent,
  prisma,
  recordTaskRunTriggered,
  resetTriggerTaskRunHarness,
  RUN_ID,
  TASK_ID,
  triggerByTaskId,
  triggerByTaskSlug,
  txTaskRunCreate,
} from "./support/trigger-task-run/harness.js";

describe("triggerTaskRun", () => {
  beforeEach(() => {
    resetTriggerTaskRunHarness();
  });

  it("rejects invalid task ids", async () => {
    const result = await triggerByTaskId({
      taskId: "not-a-uuid",
    });

    expectFailure(result, {
      status: 400,
      code: "INVALID_TASK_ID",
      message: "taskId must be a valid UUID",
    });

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("rejects tasks outside the authenticated environment", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const result = await triggerByTaskId();

    expectFailure(result, {
      status: 404,
      code: "TASK_NOT_FOUND",
      message: "Task was not found in this environment",
    });
    expectTaskLookupById();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("creates a pending task run, writes a trigger event, and enqueues the run", async () => {
    prisma.task.findFirst.mockResolvedValue(createTask());
    txTaskRunCreate.mockResolvedValue(createTaskRun());

    const result = await triggerByTaskId();

    expectPendingTaskRunResponse(result);
    expectPayloadStored();
    expectTaskRunCreated();
    expectTriggerEventWritten();
    expectRunQueued();
    expect(recordTaskRunTriggered).toHaveBeenCalledOnce();
  });

  it("returns an existing run for a matching idempotent replay", async () => {
    const payload = {
      message: "hello",
    };

    prisma.task.findFirst.mockResolvedValue(createTask());
    prisma.taskRun.findFirst.mockResolvedValue(
      createTaskRun({
        idempotencyRequestHash: hashTriggerRequest({
          taskId: TASK_ID,
          payload,
          delayUntil: undefined,
        }),
      }),
    );

    const result = await triggerByTaskId({
      body: {
        payload,
      },
      idempotencyKey: "trigger-request-1",
    });

    const success = expectTriggerSucceeded(result);

    expect(success.status).toBe(200);
    expect(success.idempotentReplayed).toBe(true);
    expect(success.taskRun.idempotentReplay).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(enqueueTaskRun).not.toHaveBeenCalled();
    expect(recordTaskRunTriggered).not.toHaveBeenCalled();
  });

  it("rejects tasks without an execution config snapshot source", async () => {
    prisma.task.findFirst.mockResolvedValue({
      ...createTask(),
      executionConfig: null,
    });

    const result = await triggerByTaskId();

    expect(result.ok).toBe(false);
    expectFailure(result, {
      status: 409,
      code: "TASK_EXECUTION_CONFIG_MISSING",
      message: "Task must be registered by a deployment with executionConfig before it can run",
    });
    expectNoRunCreatedOrQueued();
  });

  it("rejects idempotency key reuse with a different request", async () => {
    prisma.task.findFirst.mockResolvedValue(createTask());
    prisma.taskRun.findFirst.mockResolvedValue(
      createTaskRun({
        idempotencyRequestHash: "different-request-hash",
      }),
    );

    const result = await triggerByTaskId({
      idempotencyKey: "trigger-request-1",
    });

    expect(result.ok).toBe(false);
    expectFailure(result, {
      status: 409,
      code: "IDEMPOTENCY_CONFLICT",
      message: "This Idempotency-Key was already used with a different trigger request",
    });
    expectNoRunCreatedOrQueued();
  });

  it("creates a delayed pending run and enqueues it with delayMs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    try {
      const delayUntil = new Date("2026-01-01T00:01:00.000Z");

      prisma.task.findFirst.mockResolvedValue(createTask());
      txTaskRunCreate.mockResolvedValue(
        createTaskRun({
          delayUntil,
        }),
      );

      const result = await triggerByTaskId({
        body: {
          payload: {
            message: "hello",
          },
          delayUntil: delayUntil.toISOString(),
        },
      });

      expect(result.ok).toBe(true);
      expectTaskRunCreated({
        delayUntil,
      });
      expectTriggerEventWritten({
        data: expect.objectContaining({
          delayUntil: "2026-01-01T00:01:00.000Z",
        }),
      });
      expectRunQueued(60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid delayUntil values", async () => {
    prisma.task.findFirst.mockResolvedValue(createTask());

    const result = await triggerByTaskId({
      body: {
        payload: {
          message: "hello",
        },
        delayUntil: "not-a-date",
      },
    });

    expect(result.ok).toBe(false);
    expectFailure(result, {
      status: 400,
      code: "INVALID_DELAY_UNTIL",
      message: "delayUntil must be a valid ISO date string",
    });
    expectNoRunCreatedOrQueued();
  });

  it("continues an incoming traceparent when triggering a task", async () => {
    const parentTraceId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const parentSpanId = "bbbbbbbbbbbbbbbb";
    const childSpanId = "cccccccccccccccc";
    const incomingTraceparent = `00-${parentTraceId}-${parentSpanId}-01`;

    parseTraceparent.mockReturnValue({
      traceId: parentTraceId,
      spanId: parentSpanId,
    });
    createChildTraceContext.mockReturnValue({
      traceId: parentTraceId,
      spanId: childSpanId,
      parentSpanId,
    });
    prisma.task.findFirst.mockResolvedValue(createTask());
    txTaskRunCreate.mockResolvedValue(
      createTaskRun({
        traceId: parentTraceId,
        triggerSpanId: childSpanId,
      }),
    );

    const result = await triggerByTaskId({
      traceparent: incomingTraceparent,
    });

    const success = expectTriggerSucceeded(result);

    expect(parseTraceparent).toHaveBeenCalledWith(incomingTraceparent);
    expect(createRootTraceContext).not.toHaveBeenCalled();
    expect(createChildTraceContext).toHaveBeenCalledWith({
      traceId: parentTraceId,
      parentSpanId,
    });
    expectTaskRunCreated({
      traceId: parentTraceId,
      triggerSpanId: childSpanId,
    });
    expectTriggerEventWritten({
      traceId: parentTraceId,
      spanId: childSpanId,
      parentSpanId,
    });
    expect(success.taskRun.traceparent).toBe(`00-${parentTraceId}-${childSpanId}-01`);
  });

  it("creates a pending task run when triggering by task slug", async () => {
    prisma.task.findFirst.mockResolvedValue(createTask());
    txTaskRunCreate.mockResolvedValue(createTaskRun());

    const result = await triggerByTaskSlug({
      body: {
        payload: {
          name: "Ahammed",
        },
      },
    });

    const success = expectTriggerSucceeded(result);

    expect(success.status).toBe(202);
    expectTaskLookupBySlug();
    expectTaskRunCreated({
      payload: {
        name: "Ahammed",
      },
    });
    expect(enqueueTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        taskId: TASK_ID,
        environmentId: auth.environmentId,
      }),
      expect.anything(),
    );
  });
});
