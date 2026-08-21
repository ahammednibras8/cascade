import { createTaskRunEvent, Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success, type ServiceFailure } from "../../lib/service-result.js";

type CancelTaskRunInput = {
  auth: ApiAuthContext;
  runId: string | undefined;
};

type CancelTaskRunSuccess = {
  ok: true;
  status: 200;
  taskRun: {
    id: string;
    taskId: string;
    status: "CANCELED";
    canceled: true;
    alreadyCanceled: boolean;
  };
};

type CancelTaskRunFailure = ServiceFailure<400 | 404 | 409>;

export type CancelTaskRunResult = CancelTaskRunSuccess | CancelTaskRunFailure;

const cancelRunSelect = {
  id: true,
  taskId: true,
  status: true,
  attempts: {
    orderBy: {
      attemptNumber: "desc",
    },
    take: 1,
    select: {
      id: true,
      status: true,
      attemptNumber: true,
    },
  },
} as const satisfies Prisma.TaskRunSelect;

type CancelableRun = Prisma.TaskRunGetPayload<{
  select: typeof cancelRunSelect;
}>;

function createCancelError(input: {
  apiKeyId: string | undefined;
  principalId: string | undefined;
  previousStatus: string;
}): Prisma.InputJsonValue {
  const error: Record<string, Prisma.InputJsonValue> = {
    code: "RUN_CANCELED",
    message: "Task run was canceled",
    previousStatus: input.previousStatus,
  };

  if (input.apiKeyId) {
    error["apiKeyId"] = input.apiKeyId;
  }

  if (input.principalId) {
    error["principalId"] = input.principalId;
  }

  return error;
}

function createCancelSuccess(run: CancelableRun, alreadyCanceled: boolean): CancelTaskRunSuccess {
  return success(200, {
    taskRun: {
      id: run.id,
      taskId: run.taskId,
      status: "CANCELED",
      canceled: true,
      alreadyCanceled,
    },
  });
}

async function findCancelableRun(input: { auth: ApiAuthContext; runId: string }) {
  return prisma.taskRun.findFirst({
    where: {
      id: input.runId,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    select: cancelRunSelect,
  });
}

async function applyRunCancellation(auth: ApiAuthContext, run: CancelableRun) {
  const now = new Date();
  const latestAttempt = run.attempts[0];
  const error = createCancelError({
    apiKeyId: auth.apiKeyId,
    principalId: auth.principalId,
    previousStatus: run.status,
  });

  return prisma.$transaction(async (tx) => {
    const updateRun = await tx.taskRun.updateMany({
      where: {
        id: run.id,
        status: {
          in: ["PENDING", "EXECUTING"],
        },
      },
      data: {
        status: "CANCELED",
        output: Prisma.DbNull,
        error,
        lastHeartbeatAt: now,
        completedAt: now,
      },
    });

    if (updateRun.count !== 1) {
      return false;
    }

    if (latestAttempt && latestAttempt.status === "EXECUTING") {
      await tx.taskAttempt.update({
        where: {
          id: latestAttempt.id,
        },
        data: {
          status: "CANCELED",
          error,
          completedAt: now,
        },
      });
    }

    await createTaskRunEvent(tx, {
      taskRunId: run.id,
      ...(latestAttempt ? { taskAttemptId: latestAttempt.id } : {}),
      type: "task.run.canceled",
      level: "WARN",
      message: "Task run canceled by API request",
      data: {
        apiKeyId: auth.apiKeyId,
        previousStatus: run.status,
        attemptNumber: latestAttempt?.attemptNumber ?? null,
      },
    });

    return true;
  });
}

export async function cancelTaskRun(input: CancelTaskRunInput): Promise<CancelTaskRunResult> {
  if (!isUuid(input.runId)) {
    return failure(400, "INVALID_RUN_ID", "runId must be a valid UUID");
  }

  const run = await findCancelableRun({
    auth: input.auth,
    runId: input.runId,
  });

  if (!run) {
    return failure(404, "RUN_NOT_FOUND", "Task run was not found in this environment");
  }

  if (run.status === "CANCELED") {
    return createCancelSuccess(run, true);
  }

  if (run.status === "COMPLETED" || run.status === "FAILED") {
    return failure(409, "RUN_NOT_CANCELABLE", `Cannot cancel a run with status ${run.status}`);
  }

  const canceled = await applyRunCancellation(input.auth, run);

  if (!canceled) {
    return failure(
      409,
      "RUN_NOT_CANCELABLE",
      "Task run status changed before it could be canceled",
    );
  }

  return createCancelSuccess(run, false);
}
