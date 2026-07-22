import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { getPayload } from "../lib/trigger-payload.js";
import {
  hashTriggerRequest,
  hashValue,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  isUniqueConstraintError,
} from "../lib/idempotency.js";
import { isUuid } from "../lib/route-params.js";
import { enqueueTaskRun } from "../queue/task-runs.js";

const taskRunSelect = {
  id: true,
  taskId: true,
  status: true,
  payload: true,
  createdAt: true,
  idempotencyRequestHash: true,
} satisfies Prisma.TaskRunSelect;

type TriggerTaskRunInput = {
  auth: ApiAuthContext;
  taskId: string | undefined;
  body: unknown;
  idempotencyKey: string | undefined;
};

type TriggerTaskRunSuccess = {
  ok: true;
  status: 200 | 202;
  idempotentReplayed: boolean;
  taskRun: {
    id: string;
    taskId: string;
    taskSlug: string;
    taskName: string;
    status: string;
    payload: unknown;
    createdAt: string;
    idempotentReplay: boolean;
  };
};

type TriggerTaskRunFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: {
    code: string;
    message: string;
  };
};

export type TriggerTaskRunResult = TriggerTaskRunSuccess | TriggerTaskRunFailure;

async function findExistingIdempotentTaskRun(taskId: string, idempotencyKeyHash: string) {
  return prisma.taskRun.findFirst({
    where: {
      taskId,
      idempotencyKeyHash,
    },
    select: taskRunSelect,
  });
}

function createIdempotencyConflict(): TriggerTaskRunFailure {
  return {
    ok: false,
    status: 409,
    error: {
      code: "IDEMPOTENCY_CONFLICT",
      message: "This Idempotency-Key was already used with a different trigger request",
    },
  };
}

export async function triggerTaskRun(input: TriggerTaskRunInput): Promise<TriggerTaskRunResult> {
  const { auth, taskId, body, idempotencyKey } = input;

  if (!isUuid(taskId)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_TASK_ID",
        message: "taskId must be a valid UUID",
      },
    };
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      environmentId: auth.environmentId,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  if (!task) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task was not found in this environment",
      },
    };
  }

  const payload = getPayload(body);

  if (idempotencyKey && idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: `Idempotency-Key must be ${IDEMPOTENCY_KEY_MAX_LENGTH} characters or fewer`,
      },
    };
  }

  const idempotencyKeyHash = idempotencyKey ? hashValue(idempotencyKey) : undefined;
  const idempotencyRequestHash = idempotencyKeyHash
    ? hashTriggerRequest({
        taskId,
        payload,
      })
    : undefined;

  let taskRun = idempotencyKeyHash
    ? await findExistingIdempotentTaskRun(taskId, idempotencyKeyHash)
    : null;

  let created = false;

  if (taskRun) {
    if (taskRun.idempotencyRequestHash !== idempotencyRequestHash) {
      return createIdempotencyConflict();
    }
  } else {
    created = true;

    try {
      taskRun = await prisma.$transaction(async (tx) => {
        const data: Prisma.TaskRunUncheckedCreateInput = {
          taskId,
          status: "PENDING",
        };

        if (payload !== undefined) {
          data.payload = payload;
        }

        if (idempotencyKeyHash && idempotencyRequestHash) {
          data.idempotencyKeyHash = idempotencyKeyHash;
          data.idempotencyRequestHash = idempotencyRequestHash;
        }

        const run = await tx.taskRun.create({
          data,
          select: taskRunSelect,
        });

        const eventData: Record<string, Prisma.InputJsonValue> = {
          apiKeyId: auth.apiKeyId,
        };

        if (idempotencyKeyHash) {
          eventData.idempotencyKeyHash = idempotencyKeyHash;
        }

        await tx.taskEvent.create({
          data: {
            taskRunId: run.id,
            type: "task.triggered",
            level: "INFO",
            message: "Task trigger accepted and run is pending",
            data: eventData,
          },
        });

        return run;
      });
    } catch (error) {
      if (!idempotencyKeyHash || !idempotencyRequestHash || !isUniqueConstraintError(error)) {
        throw error;
      }

      const existingRun = await findExistingIdempotentTaskRun(taskId, idempotencyKeyHash);

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
    await enqueueTaskRun({
      runId: taskRun.id,
      taskId: taskRun.taskId,
      environmentId: auth.environmentId,
    });
  }

  return {
    ok: true,
    status: created ? 202 : 200,
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
    },
  };
}
