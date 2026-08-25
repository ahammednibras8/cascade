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
  type TriggerTask,
  type TriggerTaskRunInput,
  type TriggerTaskRunFailure,
  type TriggerTaskRunResult,
  type TriggeredTaskRun,
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

async function loadTriggerTask(
  input: Pick<TriggerTaskRunInput, "auth" | "taskId" | "taskSlug">,
): Promise<{ ok: true; task: TriggerTask } | { ok: false; failure: TriggerTaskRunFailure }> {
  const taskReference = getTaskReferenceWhere({
    taskId: input.taskId,
    taskSlug: input.taskSlug,
    environmentId: input.auth.environmentId,
  });

  if (!taskReference.ok) {
    return { ok: false, failure: taskReference.failure };
  }

  const task = await prisma.task.findFirst({
    where: taskReference.where,
    select: taskSelect,
  });

  if (!task) {
    return { ok: false, failure: createTaskNotFoundFailure() };
  }

  if (task.executionConfig === null) {
    return { ok: false, failure: createTaskExecutionConfigMissingFailure() };
  }

  return { ok: true, task };
}

async function createOrLoadTaskRun(input: {
  triggerInput: TriggerTaskRunInput;
  task: TriggerTask;
  payload: Prisma.InputJsonValue | undefined;
  delayUntil: Date | undefined;
  idempotencyKeyHash: string | undefined;
  idempotencyRequestHash: string | undefined;
  triggerTrace: ReturnType<typeof getTriggerTrace>;
}): Promise<
  | { ok: true; taskRun: TriggeredTaskRun; created: boolean }
  | { ok: false; failure: TriggerTaskRunFailure }
> {
  const { task, idempotencyKeyHash, idempotencyRequestHash } = input;
  const existingRun = idempotencyKeyHash
    ? await findExistingIdempotentTaskRun(task.id, idempotencyKeyHash)
    : null;

  if (existingRun) {
    return getExistingTaskRunResult(existingRun, idempotencyRequestHash);
  }

  try {
    return {
      ok: true,
      taskRun: await createTriggeredTaskRun({
        auth: input.triggerInput.auth,
        task,
        payload: input.payload,
        delayUntil: input.delayUntil,
        triggerTrace: input.triggerTrace,
        idempotencyKeyHash,
        idempotencyRequestHash,
      }),
      created: true,
    };
  } catch (error) {
    return handleCreateConflict(error, input);
  }
}

function getExistingTaskRunResult(
  taskRun: TriggeredTaskRun,
  idempotencyRequestHash: string | undefined,
):
  | { ok: true; taskRun: TriggeredTaskRun; created: false }
  | { ok: false; failure: TriggerTaskRunFailure } {
  if (taskRun.idempotencyRequestHash !== idempotencyRequestHash) {
    return { ok: false, failure: createIdempotencyConflict() };
  }

  return { ok: true, taskRun, created: false };
}

async function handleCreateConflict(
  error: unknown,
  input: {
    task: TriggerTask;
    idempotencyKeyHash: string | undefined;
    idempotencyRequestHash: string | undefined;
  },
): Promise<
  | { ok: true; taskRun: TriggeredTaskRun; created: false }
  | { ok: false; failure: TriggerTaskRunFailure }
> {
  const { task, idempotencyKeyHash, idempotencyRequestHash } = input;

  if (!idempotencyKeyHash || !idempotencyRequestHash || !isUniqueConstraintError(error)) {
    throw error;
  }

  const existingRun = await findExistingIdempotentTaskRun(task.id, idempotencyKeyHash);

  if (!existingRun) {
    throw error;
  }

  return getExistingTaskRunResult(existingRun, idempotencyRequestHash);
}

async function enqueueCreatedTaskRun(input: {
  auth: TriggerTaskRunInput["auth"];
  taskRun: TriggeredTaskRun;
}) {
  const delayMs = input.taskRun.delayUntil
    ? Math.max(input.taskRun.delayUntil.getTime() - Date.now(), 0)
    : 0;

  await enqueueTaskRun(
    {
      runId: input.taskRun.id,
      taskId: input.taskRun.taskId,
      environmentId: input.auth.environmentId,
      deploymentId: input.taskRun.deploymentId,
    },
    {
      delayMs,
    },
  );

  recordTaskRunTriggered();
}

function createTriggerSuccess(input: {
  task: TriggerTask;
  taskRun: TriggeredTaskRun;
  triggerTrace: ReturnType<typeof getTriggerTrace>;
  created: boolean;
}) {
  return success(input.created ? 202 : 200, {
    idempotentReplayed: !input.created,
    taskRun: {
      id: input.taskRun.id,
      taskId: input.taskRun.taskId,
      taskSlug: input.task.slug,
      taskName: input.task.name,
      status: input.taskRun.status,
      payload: input.taskRun.payload,
      createdAt: input.taskRun.createdAt.toISOString(),
      idempotentReplay: !input.created,
      traceparent: getTaskRunTraceparent({
        taskRun: input.taskRun,
        triggerTrace: input.triggerTrace,
      }),
    },
  });
}

export async function triggerTaskRun(input: TriggerTaskRunInput): Promise<TriggerTaskRunResult> {
  const loadedTask = await loadTriggerTask(input);

  if (!loadedTask.ok) {
    return loadedTask.failure;
  }

  const payload = getPayload(input.body);
  const delayUntilResult = getDelayUntil(input.body);

  if (!delayUntilResult.ok) {
    return delayUntilResult.failure;
  }

  const idempotencyKeyFailure = getIdempotencyKeyFailure(input.idempotencyKey);

  if (idempotencyKeyFailure) {
    return idempotencyKeyFailure;
  }

  const triggerTrace = getTriggerTrace({
    trace: input.trace,
    traceparent: input.traceparent,
  });

  const { idempotencyKeyHash, idempotencyRequestHash } = getIdempotencyHashes({
    idempotencyKey: input.idempotencyKey,
    taskId: loadedTask.task.id,
    payload,
    delayUntil: delayUntilResult.delayUntil,
  });

  const taskRunResult = await createOrLoadTaskRun({
    triggerInput: input,
    task: loadedTask.task,
    payload,
    delayUntil: delayUntilResult.delayUntil,
    idempotencyKeyHash,
    idempotencyRequestHash,
    triggerTrace,
  });

  if (!taskRunResult.ok) {
    return taskRunResult.failure;
  }

  if (taskRunResult.created) {
    await enqueueCreatedTaskRun({
      auth: input.auth,
      taskRun: taskRunResult.taskRun,
    });
  }

  return createTriggerSuccess({
    task: loadedTask.task,
    taskRun: taskRunResult.taskRun,
    triggerTrace,
    created: taskRunResult.created,
  });
}
