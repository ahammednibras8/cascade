import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";

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

type CancelTaskRunFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: {
    code: string;
    message: string;
  };
};

export type CancelTaskRunResult = CancelTaskRunSuccess | CancelTaskRunFailure;

function createCancelError(input: {
  apiKeyId: string;
  previousStatus: string;
}): Prisma.InputJsonValue {
  return {
    code: "RUN_CANCELED",
    message: "Task run was canceled",
    apiKeyId: input.apiKeyId,
    previousStatus: input.previousStatus,
  };
}

export async function cancelTaskRun(input: CancelTaskRunInput): Promise<CancelTaskRunResult> {
  const { auth, runId } = input;

  if (!isUuid(runId)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_RUN_ID",
        message: "runId must be a valid UUID",
      },
    };
  }

  const run = await prisma.taskRun.findFirst({
    where: {
      id: runId,
      task: {
        environmentId: auth.environmentId,
      },
    },
    select: {
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
    },
  });

  if (!run) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Task run was not found in this environment",
      },
    };
  }

  if (run.status === "CANCELED") {
    return {
      ok: true,
      status: 200,
      taskRun: {
        id: run.id,
        taskId: run.taskId,
        status: run.status,
        canceled: true,
        alreadyCanceled: true,
      },
    };
  }

  if (run.status === "COMPLETED" || run.status === "FAILED") {
    return {
      ok: false,
      status: 409,
      error: {
        code: "RUN_NOT_CANCELABLE",
        message: `Cannot cancel a run with status ${run.status}`,
      },
    };
  }

  const now = new Date();
  const latestAttempt = run.attempts[0];
  const error = createCancelError({
    apiKeyId: auth.apiKeyId,
    previousStatus: run.status,
  });

  const canceled = await prisma.$transaction(async (tx) => {
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

    await tx.taskEvent.create({
      data: {
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
      },
    });

    return true;
  });

  if (!canceled) {
    return {
      ok: false,
      status: 409,
      error: {
        code: "RUN_NOT_CANCELABLE",
        message: "Task run status changed before it could be canceled",
      },
    };
  }

  return {
    ok: true,
    status: 200,
    taskRun: {
      id: run.id,
      taskId: run.taskId,
      status: "CANCELED",
      canceled: true,
      alreadyCanceled: false,
    },
  };
}
