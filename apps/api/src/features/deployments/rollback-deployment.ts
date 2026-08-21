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

export async function rollbackDeployment(
  input: RollbackDeploymentInput,
): Promise<RollbackDeploymentResult> {
  if (!isUuid(input.deploymentId)) {
    return failure(400, "INVALID_DEPLOYMENT_ID", "deploymentId must be a valid UUID");
  }

  const deployment = await prisma.deployment.findFirst({
    where: {
      id: input.deploymentId,
      environmentId: input.auth.environmentId,
    },
    select: {
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
    },
  });

  if (!deployment) {
    return failure(404, "DEPLOYMENT_NOT_FOUND", "Deployment was not found in this environment");
  }

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

  const result = await prisma.$transaction(async (tx) => {
    const activated = await tx.deployment.updateMany({
      where: {
        id: deployment.id,
        environmentId: input.auth.environmentId,
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

    if (activated.count !== 1) {
      return null;
    }

    await tx.deployment.updateMany({
      where: {
        environmentId: input.auth.environmentId,
        id: {
          not: deployment.id,
        },
        status: "ACTIVE",
      },
      data: {
        status: "INACTIVE",
      },
    });

    const restoredSlugs = deployment.manifestTasks.map((task) => task.slug);
    const omittedTaskWhere = getOmittedTaskWhere({
      environmentId: input.auth.environmentId,
      restoredSlugs,
    });

    const pausedSchedules = await tx.taskSchedule.updateMany({
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

    const detachedTasks = await tx.task.updateMany({
      where: omittedTaskWhere,
      data: {
        deploymentId: null,
        executionConfig: Prisma.DbNull,
      },
    });

    const restoredTasks = await Promise.all(
      deployment.manifestTasks.map((task) =>
        tx.task.upsert({
          where: {
            environmentId_slug: {
              environmentId: input.auth.environmentId,
              slug: task.slug,
            },
          },
          create: {
            environmentId: input.auth.environmentId,
            deploymentId: deployment.id,
            slug: task.slug,
            name: task.name,
            description: task.description,
            executionConfig: task.executionConfig as Prisma.InputJsonValue,
          },
          update: {
            deploymentId: deployment.id,
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

    const updatedSchedules = await tx.taskSchedule.updateMany({
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

    return {
      tasksRestored: restoredTasks.length,
      tasksDetached: detachedTasks.count,
      schedulesUpdated: updatedSchedules.count,
      schedulesPaused: pausedSchedules.count,
    };
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
