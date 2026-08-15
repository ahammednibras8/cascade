import { maybeStoreJsonValue } from "@cascade/storage";
import type { TraceContext } from "@cascade/core";
import { createTaskRunEvent, prisma, type Prisma } from "@cascade/database";
import { randomUUID } from "node:crypto";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { taskRunSelect, type TriggerTask, type TriggeredTaskRun } from "./types.js";

type CreateTriggeredTaskRunInput = {
  auth: ApiAuthContext;
  task: TriggerTask;
  payload: unknown;
  delayUntil: Date | undefined;
  triggerTrace: TraceContext;
  idempotencyKeyHash: string | undefined;
  idempotencyRequestHash: string | undefined;
};

export async function findExistingIdempotentTaskRun(taskId: string, idempotencyKeyHash: string) {
  return prisma.taskRun.findFirst({
    where: {
      taskId,
      idempotencyKeyHash,
    },
    select: taskRunSelect,
  });
}

function buildTaskRunCreateData(input: {
  runId: string;
  task: TriggerTask;
  storedPayload: unknown;
  delayUntil: Date | undefined;
  triggerTrace: TraceContext;
  idempotencyKeyHash: string | undefined;
  idempotencyRequestHash: string | undefined;
}) {
  const data: Prisma.TaskRunUncheckedCreateInput = {
    id: input.runId,
    taskId: input.task.id,
    status: "PENDING",
    traceId: input.triggerTrace.traceId,
    triggerSpanId: input.triggerTrace.spanId,
    deploymentId: input.task.deploymentId,
    executionConfig: input.task.executionConfig as Prisma.InputJsonValue,
  };

  if (input.storedPayload !== undefined) {
    data.payload = input.storedPayload as Prisma.InputJsonValue;
  }

  if (input.idempotencyKeyHash && input.idempotencyRequestHash) {
    data.idempotencyKeyHash = input.idempotencyKeyHash;
    data.idempotencyRequestHash = input.idempotencyRequestHash;
  }

  if (input.delayUntil) {
    data.delayUntil = input.delayUntil;
  }

  return data;
}

function buildTriggerEventData(input: CreateTriggeredTaskRunInput) {
  const data: Record<string, Prisma.InputJsonValue> = {
    apiKeyId: input.auth.apiKeyId,
    traceId: input.triggerTrace.traceId,
    spanId: input.triggerTrace.spanId,
  };

  if (input.triggerTrace.parentSpanId) {
    data.parentSpanId = input.triggerTrace.parentSpanId;
  }

  if (input.idempotencyKeyHash) {
    data.idempotencyKeyHash = input.idempotencyKeyHash;
  }

  if (input.delayUntil) {
    data.delayUntil = input.delayUntil.toISOString();
  }

  return data;
}

export async function createTriggeredTaskRun(
  input: CreateTriggeredTaskRunInput,
): Promise<TriggeredTaskRun> {
  const runId = randomUUID();

  const storedPayload =
    input.payload === undefined
      ? undefined
      : await maybeStoreJsonValue({
          kind: "PAYLOAD",
          environmentId: input.auth.environmentId,
          taskId: input.task.id,
          runId,
          value: input.payload,
        });

  return prisma.$transaction(async (tx) => {
    const run = await tx.taskRun.create({
      data: buildTaskRunCreateData({
        runId,
        task: input.task,
        storedPayload,
        delayUntil: input.delayUntil,
        triggerTrace: input.triggerTrace,
        idempotencyKeyHash: input.idempotencyKeyHash,
        idempotencyRequestHash: input.idempotencyRequestHash,
      }),
      select: taskRunSelect,
    });

    await createTaskRunEvent(tx, {
      taskRunId: run.id,
      type: "task.triggered",
      level: "INFO",
      message: "Task trigger accepted and run is pending",
      traceId: input.triggerTrace.traceId,
      spanId: input.triggerTrace.spanId,
      parentSpanId: input.triggerTrace.parentSpanId,
      data: buildTriggerEventData(input),
    });

    return run;
  });
}
