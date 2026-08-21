import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success, type ServiceFailure } from "../../lib/service-result.js";
import { createTaskRunEvent, prisma, type Prisma } from "@cascade/database";
import { enqueueTaskRun } from "../../queue/task-runs.js";

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

type ReplayTaskRunFailure = ServiceFailure<400 | 404 | 409>;

export type ReplayTaskRunResult = ReplayTaskRunSuccess | ReplayTaskRunFailure;

function isReplayableStatus(status: string) {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELED";
}

export async function replayTaskRun(input: ReplayTaskRunInput): Promise<ReplayTaskRunResult> {
  const { auth, runId } = input;

  if (!isUuid(runId)) {
    return failure(400, "INVALID_RUN_ID", "runId must be a valid UUID");
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
      deploymentId: true,
      status: true,
      payload: true,
      executionConfig: true,
    },
  });

  if (!sourceRun) {
    return failure(404, "RUN_NOT_FOUND", "Task run was not found in this environment");
  }

  if (sourceRun.executionConfig === null) {
    return failure(
      409,
      "RUN_EXECUTION_CONFIG_MISSING",
      "This legacy run has no execution configuration snapshot and cannot be replayed",
    );
  }

  if (!isReplayableStatus(sourceRun.status)) {
    return failure(
      409,
      "RUN_NOT_REPLAYABLE",
      `Cannot replay a run with status ${sourceRun.status}`,
    );
  }

  const replayedRun = await prisma.$transaction(async (tx) => {
    const data: Prisma.TaskRunUncheckedCreateInput = {
      taskId: sourceRun.taskId,
      deploymentId: sourceRun.deploymentId,
      status: "PENDING",
      executionConfig: sourceRun.executionConfig as Prisma.InputJsonValue,
    };

    if (sourceRun.payload !== null) {
      data.payload = sourceRun.payload as Prisma.InputJsonValue;
    }

    const run = await tx.taskRun.create({
      data,
      select: {
        id: true,
        taskId: true,
        deploymentId: true,
        status: true,
        payload: true,
        createdAt: true,
      },
    });

    await createTaskRunEvent(tx, {
      taskRunId: run.id,
      type: "task.run.replayed",
      level: "INFO",
      message: "Task run manually replayed",
      data: {
        apiKeyId: auth.apiKeyId,
        sourceRunId: sourceRun.id,
        sourceStatus: sourceRun.status,
      },
    });

    await createTaskRunEvent(tx, {
      taskRunId: sourceRun.id,
      type: "task.run.replay.created",
      level: "INFO",
      message: "Manual replay created a new task run",
      data: {
        apiKeyId: auth.apiKeyId,
        replayedRunId: run.id,
      },
    });

    return run;
  });

  await enqueueTaskRun({
    runId: replayedRun.id,
    taskId: replayedRun.taskId,
    environmentId: auth.environmentId,
    deploymentId: replayedRun.deploymentId,
  });

  return success(202, {
    taskRun: {
      id: replayedRun.id,
      taskId: replayedRun.taskId,
      status: replayedRun.status,
      payload: replayedRun.payload,
      createdAt: replayedRun.createdAt.toISOString(),
      replayedFromRunId: sourceRun.id,
    },
  });
}
