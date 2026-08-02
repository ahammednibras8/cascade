import type { Prisma } from "@cascade/database";
import { IDEMPOTENCY_KEY_MAX_LENGTH } from "../../lib/idempotency.js";
import { isUuid } from "../../lib/route-params.js";
import type { TriggerTaskRunFailure } from "./types.js";

type TaskReferenceResult =
  | {
      ok: true;
      where: Prisma.TaskWhereInput;
    }
  | {
      ok: false;
      failure: TriggerTaskRunFailure;
    };

function createFailure(
  status: TriggerTaskRunFailure["status"],
  code: string,
  message: string,
): TriggerTaskRunFailure {
  return {
    ok: false,
    status,
    error: {
      code,
      message,
    },
  };
}

function isValidTaskSlug(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getTaskReferenceWhere(input: {
  taskId: string | undefined;
  taskSlug: string | undefined;
  environmentId: string;
}): TaskReferenceResult {
  const hasTaskId = input.taskId !== undefined;
  const hasTaskSlug = input.taskSlug !== undefined;

  if (hasTaskId === hasTaskSlug) {
    return {
      ok: false,
      failure: createFailure(
        400,
        "INVALID_TASK_REFERENCE",
        "Provide exactly one of taskId or taskSlug",
      ),
    };
  }

  if (hasTaskId) {
    const taskId = input.taskId;

    if (!taskId || !isUuid(taskId)) {
      return {
        ok: false,
        failure: createFailure(400, "INVALID_TASK_ID", "taskId must be a valid UUID"),
      };
    }

    return {
      ok: true,
      where: {
        id: taskId,
        environmentId: input.environmentId,
      },
    };
  }

  const taskSlug = input.taskSlug;

  if (!isValidTaskSlug(taskSlug)) {
    return {
      ok: false,
      failure: createFailure(400, "INVALID_TASK_SLUG", "taskSlug must be a non-empty string"),
    };
  }

  return {
    ok: true,
    where: {
      slug: taskSlug,
      environmentId: input.environmentId,
    },
  };
}

export function createTaskNotFoundFailure() {
  return createFailure(404, "TASK_NOT_FOUND", "Task was not found in this environment");
}

export function createTaskExecutionConfigMissingFailure() {
  return createFailure(
    409,
    "TASK_EXECUTION_CONFIG_MISSING",
    "Task must be registered by a deployment with executionConfig before it can run",
  );
}

export function createIdempotencyConflict() {
  return createFailure(
    409,
    "IDEMPOTENCY_CONFLICT",
    "This Idempotency-Key was already used with a different trigger request",
  );
}

export function getIdempotencyKeyFailure(idempotencyKey: string | undefined) {
  if (!idempotencyKey || idempotencyKey.length <= IDEMPOTENCY_KEY_MAX_LENGTH) {
    return null;
  }

  return createFailure(
    400,
    "INVALID_IDEMPOTENCY_KEY",
    `Idempotency-Key must be ${IDEMPOTENCY_KEY_MAX_LENGTH} characters or fewer`,
  );
}

export function getDelayUntil(
  body: unknown,
): { ok: true; delayUntil: Date | undefined } | { ok: false; failure: TriggerTaskRunFailure } {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("delayUntil" in body)) {
    return {
      ok: true,
      delayUntil: undefined,
    };
  }

  const rawDelayUntil = (body as { delayUntil?: unknown }).delayUntil;

  if (rawDelayUntil === undefined || rawDelayUntil === null) {
    return {
      ok: true,
      delayUntil: undefined,
    };
  }

  if (typeof rawDelayUntil !== "string") {
    return {
      ok: false,
      failure: createFailure(400, "INVALID_DELAY_UNTIL", "delayUntil must be an ISO date string"),
    };
  }

  const delayUntil = new Date(rawDelayUntil);

  if (Number.isNaN(delayUntil.getTime())) {
    return {
      ok: false,
      failure: createFailure(
        400,
        "INVALID_DELAY_UNTIL",
        "delayUntil must be a valid ISO date string",
      ),
    };
  }

  return {
    ok: true,
    delayUntil,
  };
}
