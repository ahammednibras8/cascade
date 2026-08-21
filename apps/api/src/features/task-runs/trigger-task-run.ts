import { recordTaskRunTriggered } from "@cascade/telemetry";
import { prisma, type Prisma } from "@cascade/database";
import { getPayload } from "../../lib/trigger-payload.js";
import { hashTriggerRequest, hashValue, isUniqueConstraintError } from "../../lib/idempotency.js";
import { success } from "../../lib/service-result.js";
import { enqueueTaskRun } from "../../queue/task-runs.js";
import {
  createTriggeredTaskRun,
  findExistingIdempotentTaskRun,
} from "./trigger-task-run/persistence.js";
import { getTaskRunTraceparent, getTriggerTrace } from "./trigger-task-run/trace.js";
import {
  taskSelect,
  type TriggerTaskRunInput,
  type TriggerTaskRunResult,
} from "./trigger-task-run/types.js";
import {
  createIdempotencyConflict,
  createTaskExecutionConfigMissingFailure,
  createTaskNotFoundFailure,
  getDelayUntil,
  getIdempotencyKeyFailure,
  getTaskReferenceWhere,
} from "./trigger-task-run/validation.js";

export type { TriggerTaskRunResult } from "./trigger-task-run/types.js";

function getIdempotencyHashes(input: {
  idempotencyKey: string | undefined;
  taskId: string;
  payload: Prisma.InputJsonValue | undefined;
  delayUntil: Date | undefined;
}) {
  const idempotencyKeyHash = input.idempotencyKey ? hashValue(input.idempotencyKey) : undefined;
  const idempotencyRequestHash = idempotencyKeyHash
    ? hashTriggerRequest({
        taskId: input.taskId,
        payload: input.payload,
        delayUntil: input.delayUntil,
      })
    : undefined;

  return {
    idempotencyKeyHash,
    idempotencyRequestHash,
  };
}

export async function triggerTaskRun(input: TriggerTaskRunInput): Promise<TriggerTaskRunResult> {
  const { auth, taskId, taskSlug, body, idempotencyKey } = input;

  const taskReference = getTaskReferenceWhere({
    taskId,
    taskSlug,
    environmentId: auth.environmentId,
  });

  if (!taskReference.ok) {
    return taskReference.failure;
  }

  const task = await prisma.task.findFirst({
    where: taskReference.where,
    select: taskSelect,
  });

  if (!task) {
    return createTaskNotFoundFailure();
  }

  if (task.executionConfig === null) {
    return createTaskExecutionConfigMissingFailure();
  }

  const payload = getPayload(body);
  const delayUntilResult = getDelayUntil(body);

  if (!delayUntilResult.ok) {
    return delayUntilResult.failure;
  }

  const idempotencyKeyFailure = getIdempotencyKeyFailure(idempotencyKey);

  if (idempotencyKeyFailure) {
    return idempotencyKeyFailure;
  }

  const triggerTrace = getTriggerTrace({
    trace: input.trace,
    traceparent: input.traceparent,
  });

  const { idempotencyKeyHash, idempotencyRequestHash } = getIdempotencyHashes({
    idempotencyKey,
    taskId: task.id,
    payload,
    delayUntil: delayUntilResult.delayUntil,
  });

  let taskRun = idempotencyKeyHash
    ? await findExistingIdempotentTaskRun(task.id, idempotencyKeyHash)
    : null;

  let created = false;

  if (taskRun) {
    if (taskRun.idempotencyRequestHash !== idempotencyRequestHash) {
      return createIdempotencyConflict();
    }
  } else {
    created = true;

    try {
      taskRun = await createTriggeredTaskRun({
        auth,
        task,
        payload,
        delayUntil: delayUntilResult.delayUntil,
        triggerTrace,
        idempotencyKeyHash,
        idempotencyRequestHash,
      });
    } catch (error) {
      if (!idempotencyKeyHash || !idempotencyRequestHash || !isUniqueConstraintError(error)) {
        throw error;
      }

      const existingRun = await findExistingIdempotentTaskRun(task.id, idempotencyKeyHash);

      if (!existingRun) {
        throw error;
      }

      if (existingRun.idempotencyRequestHash !== idempotencyRequestHash) {
        return createIdempotencyConflict();
      }

      taskRun = existingRun;
      created = false;
    }
  }

  if (!taskRun) {
    throw new Error("TaskRun was not created or loaded");
  }

  if (created) {
    const delayMs = taskRun.delayUntil ? Math.max(taskRun.delayUntil.getTime() - Date.now(), 0) : 0;

    await enqueueTaskRun(
      {
        runId: taskRun.id,
        taskId: taskRun.taskId,
        environmentId: auth.environmentId,
        deploymentId: taskRun.deploymentId,
      },
      {
        delayMs,
      },
    );

    recordTaskRunTriggered();
  }

  return success(created ? 202 : 200, {
    idempotentReplayed: !created,
    taskRun: {
      id: taskRun.id,
      taskId: taskRun.taskId,
      taskSlug: task.slug,
      taskName: task.name,
      status: taskRun.status,
      payload: taskRun.payload,
      createdAt: taskRun.createdAt.toISOString(),
      idempotentReplay: !created,
      traceparent: getTaskRunTraceparent({
        taskRun,
        triggerTrace,
      }),
    },
  });
}
