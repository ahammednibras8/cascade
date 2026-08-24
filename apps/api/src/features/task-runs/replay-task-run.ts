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

const sourceRunSelect = {
  id: true,
  taskId: true,
  deploymentId: true,
  status: true,
  payload: true,
  executionConfig: true,
} as const satisfies Prisma.TaskRunSelect;

const replayedRunSelect = {
  id: true,
  taskId: true,
  deploymentId: true,
  status: true,
  payload: true,
  createdAt: true,
} as const satisfies Prisma.TaskRunSelect;

type SourceRun = Prisma.TaskRunGetPayload<{
  select: typeof sourceRunSelect;
}>;

type ReplayedRun = Prisma.TaskRunGetPayload<{
  select: typeof replayedRunSelect;
}>;

function isReplayableStatus(status: string) {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELED";
}

async function findSourceRun(input: { auth: ApiAuthContext; runId: string }) {
  return prisma.taskRun.findFirst({
    where: {
      id: input.runId,
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    select: sourceRunSelect,
  });
}

function getReplayValidationFailure(sourceRun: SourceRun): ReplayTaskRunFailure | null {
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

  return null;
}

function buildReplayRunData(
  auth: ApiAuthContext,
  sourceRun: SourceRun,
): Prisma.TaskRunUncheckedCreateInput {
  const data: Prisma.TaskRunUncheckedCreateInput = {
    taskId: sourceRun.taskId,
    environmentId: auth.environmentId,
    deploymentId: sourceRun.deploymentId,
    status: "PENDING",
    executionConfig: sourceRun.executionConfig as Prisma.InputJsonValue,
  };

  if (sourceRun.payload !== null) {
    data.payload = sourceRun.payload as Prisma.InputJsonValue;
  }

  return data;
}

async function createReplayedRun(auth: ApiAuthContext, sourceRun: SourceRun): Promise<ReplayedRun> {
  return prisma.$transaction(async (tx) => {
    const run = await tx.taskRun.create({
      data: buildReplayRunData(auth, sourceRun),
      select: replayedRunSelect,
    });

    await writeReplayEvents(tx, auth, sourceRun, run);

    return run;
  });
}

async function writeReplayEvents(
  tx: Prisma.TransactionClient,
  auth: ApiAuthContext,
  sourceRun: SourceRun,
  run: ReplayedRun,
) {
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
}

async function enqueueReplayedRun(auth: ApiAuthContext, replayedRun: ReplayedRun) {
  await enqueueTaskRun({
    runId: replayedRun.id,
    taskId: replayedRun.taskId,
    environmentId: auth.environmentId,
    deploymentId: replayedRun.deploymentId,
  });
}

function createReplaySuccess(sourceRun: SourceRun, replayedRun: ReplayedRun): ReplayTaskRunSuccess {
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

export async function replayTaskRun(input: ReplayTaskRunInput): Promise<ReplayTaskRunResult> {
  if (!isUuid(input.runId)) {
    return failure(400, "INVALID_RUN_ID", "runId must be a valid UUID");
  }

  const sourceRun = await findSourceRun({
    auth: input.auth,
    runId: input.runId,
  });

  if (!sourceRun) {
    return failure(404, "RUN_NOT_FOUND", "Task run was not found in this environment");
  }

  const validationFailure = getReplayValidationFailure(sourceRun);

  if (validationFailure) {
    return validationFailure;
  }

  const replayedRun = await createReplayedRun(input.auth, sourceRun);

  await enqueueReplayedRun(input.auth, replayedRun);

  return createReplaySuccess(sourceRun, replayedRun);
}
