import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";
import { prisma, Prisma } from "@cascade/database";
import { enqueueTaskRun } from "../queue/task-runs.js";

type ReplayTaskRunInput = {
  auth: ApiAuthContext;
  runId: string | undefined;
};

type ReplayTaskRunSuccess = {
  ok: true;
  status: 202;
  taskRun: {
    id: string;
    taskId: string;
    status: string;
    payload: unknown;
    createdAt: string;
    replayedFromRunId: string;
  };
};

type ReplayTaskRunFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: {
    code: string;
    message: string;
  };
};

export type ReplayTaskRunResult = ReplayTaskRunSuccess | ReplayTaskRunFailure;

function isReplayableStatus(status: string) {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELED";
}

export async function replayTaskRun(input: ReplayTaskRunInput): Promise<ReplayTaskRunResult> {
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

  const sourceRun = await prisma.taskRun.findFirst({
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
      payload: true,
    },
  });

  if (!sourceRun) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Task run was not found in this environment",
      },
    };
  }

  if (!isReplayableStatus(sourceRun.status)) {
    return {
      ok: false,
      status: 409,
      error: {
        code: "RUN_NOT_REPLAYABLE",
        message: `Cannot replay a run with status ${sourceRun.status}`,
      },
    };
  }

  const replayedRun = await prisma.$transaction(async (tx) => {
    const data: Prisma.TaskRunUncheckedCreateInput = {
      taskId: sourceRun.taskId,
      status: "PENDING",
    };

    if (sourceRun.payload !== null) {
      data.payload = sourceRun.payload as Prisma.InputJsonValue;
    }

    const run = await tx.taskRun.create({
      data,
      select: {
        id: true,
        taskId: true,
        status: true,
        payload: true,
        createdAt: true,
      },
    });

    await tx.taskEvent.create({
      data: {
        taskRunId: run.id,
        type: "task.run.replayed",
        level: "INFO",
        message: "Task run manually replayed",
        data: {
          apiKeyId: auth.apiKeyId,
          sourceRunId: sourceRun.id,
          sourceStatus: sourceRun.status,
        },
      },
    });

    await tx.taskEvent.create({
      data: {
        taskRunId: sourceRun.id,
        type: "task.run.replay.created",
        level: "INFO",
        message: "Manual replay created a new task run",
        data: {
          apiKeyId: auth.apiKeyId,
          replayedRunId: run.id,
        },
      },
    });

    return run;
  });

  await enqueueTaskRun({
    runId: replayedRun.id,
    taskId: replayedRun.taskId,
    environmentId: auth.environmentId,
  });

  return {
    ok: true,
    status: 202,
    taskRun: {
      id: replayedRun.id,
      taskId: replayedRun.taskId,
      status: replayedRun.status,
      payload: replayedRun.payload,
      createdAt: replayedRun.createdAt.toISOString(),
      replayedFromRunId: sourceRun.id,
    },
  };
}
