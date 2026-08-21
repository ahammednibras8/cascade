import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success, type ServiceFailure } from "../../lib/service-result.js";

type RollbackDeploymentInput = {
  auth: ApiAuthContext;
  deploymentId: string | undefined;
};

type RollbackDeploymentSuccess = {
  ok: true;
  status: 200;
  deployment: {
    id: string;
    status: "ACTIVE";
    tasksRestored: number;
    tasksDetached: number;
    schedulesUpdated: number;
    schedulesPaused: number;
  };
};

type RollbackDeploymentFailure = ServiceFailure<400 | 404 | 409>;

export type RollbackDeploymentResult = RollbackDeploymentSuccess | RollbackDeploymentFailure;

const rollbackDeploymentSelect = {
  id: true,
  status: true,
  manifestTasks: {
    orderBy: {
      slug: "asc",
    },
    select: {
      slug: true,
      name: true,
      description: true,
      executionConfig: true,
    },
  },
} as const satisfies Prisma.DeploymentSelect;

type RollbackDeployment = Prisma.DeploymentGetPayload<{
  select: typeof rollbackDeploymentSelect;
}>;

type RollbackTransaction = Prisma.TransactionClient;

type RollbackStats = {
  tasksRestored: number;
  tasksDetached: number;
  schedulesUpdated: number;
  schedulesPaused: number;
};

function getOmittedTaskWhere(input: {
  environmentId: string;
  restoredSlugs: string[];
}): Prisma.TaskWhereInput {
  return {
    environmentId: input.environmentId,
    deploymentId: {
      not: null,
    },
    slug: {
      notIn: input.restoredSlugs,
    },
  };
}

async function findRollbackDeployment(input: { auth: ApiAuthContext; deploymentId: string }) {
  return prisma.deployment.findFirst({
    where: {
      id: input.deploymentId,
      environmentId: input.auth.environmentId,
    },
    select: rollbackDeploymentSelect,
  });
}

function getRollbackValidationFailure(
  deployment: RollbackDeployment,
): RollbackDeploymentFailure | null {
  if (deployment.status === "ACTIVE") {
    return failure(409, "DEPLOYMENT_ALREADY_ACTIVE", "Deployment is already active");
  }

  if (deployment.status !== "INACTIVE") {
    return failure(
      409,
      "DEPLOYMENT_NOT_ROLLBACKABLE",
      `Cannot roll back a deployment with status ${deployment.status}`,
    );
  }

  if (deployment.manifestTasks.length === 0) {
    return failure(
      409,
      "DEPLOYMENT_MANIFEST_MISSING",
      "This deployment was created before task manifests were stored and cannot be rolled back",
    );
  }

  return null;
}

async function activateDeployment(input: {
  tx: RollbackTransaction;
  deployment: RollbackDeployment;
  environmentId: string;
}) {
  return input.tx.deployment.updateMany({
    where: {
      id: input.deployment.id,
      environmentId: input.environmentId,
      status: "INACTIVE",
    },
    data: {
      status: "ACTIVE",
      runtimeStatus: "PENDING",
      runtimeContainerId: null,
      runtimeError: null,
      runtimeStartedAt: null,
      runtimeStoppedAt: null,
    },
  });
}

async function deactivateOtherDeployments(input: {
  tx: RollbackTransaction;
  deployment: RollbackDeployment;
  environmentId: string;
}) {
  await input.tx.deployment.updateMany({
    where: {
      environmentId: input.environmentId,
      id: {
        not: input.deployment.id,
      },
      status: "ACTIVE",
    },
    data: {
      status: "INACTIVE",
    },
  });
}

async function pauseOmittedSchedules(
  tx: RollbackTransaction,
  omittedTaskWhere: Prisma.TaskWhereInput,
) {
  return tx.taskSchedule.updateMany({
    where: {
      enabled: true,
      task: omittedTaskWhere,
    },
    data: {
      enabled: false,
      lockedAt: null,
      revision: {
        increment: 1,
      },
    },
  });
}

async function detachOmittedTasks(
  tx: RollbackTransaction,
  omittedTaskWhere: Prisma.TaskWhereInput,
) {
  return tx.task.updateMany({
    where: omittedTaskWhere,
    data: {
      deploymentId: null,
      executionConfig: Prisma.DbNull,
    },
  });
}

async function restoreManifestTasks(input: {
  tx: RollbackTransaction;
  deployment: RollbackDeployment;
  environmentId: string;
}) {
  return Promise.all(
    input.deployment.manifestTasks.map((task) =>
      input.tx.task.upsert({
        where: {
          environmentId_slug: {
            environmentId: input.environmentId,
            slug: task.slug,
          },
        },
        create: {
          environmentId: input.environmentId,
          deploymentId: input.deployment.id,
          slug: task.slug,
          name: task.name,
          description: task.description,
          executionConfig: task.executionConfig as Prisma.InputJsonValue,
        },
        update: {
          deploymentId: input.deployment.id,
          name: task.name,
          description: task.description,
          executionConfig: task.executionConfig as Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      }),
    ),
  );
}

async function unlockRestoredSchedules(
  tx: RollbackTransaction,
  restoredTasks: Array<{ id: string }>,
) {
  return tx.taskSchedule.updateMany({
    where: {
      taskId: {
        in: restoredTasks.map((task) => task.id),
      },
    },
    data: {
      lockedAt: null,
      revision: {
        increment: 1,
      },
    },
  });
}

function createRollbackStats(input: {
  restoredTasks: Array<{ id: string }>;
  tasksDetached: number;
  schedulesUpdated: number;
  schedulesPaused: number;
}): RollbackStats {
  return {
    tasksRestored: input.restoredTasks.length,
    tasksDetached: input.tasksDetached,
    schedulesUpdated: input.schedulesUpdated,
    schedulesPaused: input.schedulesPaused,
  };
}

async function rollbackDeploymentInTransaction(input: {
  deployment: RollbackDeployment;
  environmentId: string;
}) {
  return prisma.$transaction(async (tx): Promise<RollbackStats | null> => {
    const activated = await activateDeployment({ tx, ...input });

    if (activated.count !== 1) {
      return null;
    }

    await deactivateOtherDeployments({ tx, ...input });

    const omittedTaskWhere = getOmittedTaskWhere({
      environmentId: input.environmentId,
      restoredSlugs: input.deployment.manifestTasks.map((task) => task.slug),
    });
    const pausedSchedules = await pauseOmittedSchedules(tx, omittedTaskWhere);
    const detachedTasks = await detachOmittedTasks(tx, omittedTaskWhere);
    const restoredTasks = await restoreManifestTasks({ tx, ...input });
    const updatedSchedules = await unlockRestoredSchedules(tx, restoredTasks);

    return createRollbackStats({
      restoredTasks,
      tasksDetached: detachedTasks.count,
      schedulesUpdated: updatedSchedules.count,
      schedulesPaused: pausedSchedules.count,
    });
  });
}

export async function rollbackDeployment(
  input: RollbackDeploymentInput,
): Promise<RollbackDeploymentResult> {
  if (!isUuid(input.deploymentId)) {
    return failure(400, "INVALID_DEPLOYMENT_ID", "deploymentId must be a valid UUID");
  }

  const deployment = await findRollbackDeployment({
    auth: input.auth,
    deploymentId: input.deploymentId,
  });

  if (!deployment) {
    return failure(404, "DEPLOYMENT_NOT_FOUND", "Deployment was not found in this environment");
  }

  const validationFailure = getRollbackValidationFailure(deployment);

  if (validationFailure) {
    return validationFailure;
  }

  const result = await rollbackDeploymentInTransaction({
    deployment,
    environmentId: input.auth.environmentId,
  });

  if (!result) {
    return failure(
      409,
      "DEPLOYMENT_STATE_CHANGED",
      "Deployment state changed before it could be rolled back",
    );
  }

  return success(200, {
    deployment: {
      id: deployment.id,
      status: "ACTIVE",
      tasksRestored: result.tasksRestored,
      tasksDetached: result.tasksDetached,
      schedulesUpdated: result.schedulesUpdated,
      schedulesPaused: result.schedulesPaused,
    },
  });
}
