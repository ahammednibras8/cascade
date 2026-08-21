import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success, type ServiceFailure } from "../../lib/service-result.js";

type DeactivateDeploymentInput = {
  auth: ApiAuthContext;
  deploymentId: string | undefined;
};

type DeactivateDeploymentSuccess = {
  ok: true;
  status: 200;
  deployment: {
    id: string;
    status: "INACTIVE";
    tasksDetached: number;
    schedulesPaused: number;
  };
};

type DeactivateDeploymentFailure = ServiceFailure<400 | 404 | 409>;

export type DeactivateDeploymentResult = DeactivateDeploymentSuccess | DeactivateDeploymentFailure;

export async function deactivateDeployment(
  input: DeactivateDeploymentInput,
): Promise<DeactivateDeploymentResult> {
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
    },
  });

  if (!deployment) {
    return failure(404, "DEPLOYMENT_NOT_FOUND", "Deployment was not found in this environment");
  }

  if (deployment.status === "INACTIVE") {
    return failure(409, "DEPLOYMENT_ALREADY_INACTIVE", "Deployment is already inactive");
  }

  if (deployment.status !== "ACTIVE") {
    return failure(
      409,
      "DEPLOYMENT_NOT_DEACTIVATABLE",
      `Cannot deactivate a deployment with status ${deployment.status}`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const deactivated = await tx.deployment.updateMany({
      where: {
        id: deployment.id,
        environmentId: input.auth.environmentId,
        status: "ACTIVE",
      },
      data: {
        status: "INACTIVE",
      },
    });

    if (deactivated.count !== 1) {
      return null;
    }

    const pausedSchedules = await tx.taskSchedule.updateMany({
      where: {
        enabled: true,
        task: {
          environmentId: input.auth.environmentId,
          deploymentId: deployment.id,
        },
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
      where: {
        environmentId: input.auth.environmentId,
        deploymentId: deployment.id,
      },
      data: {
        deploymentId: null,
        executionConfig: Prisma.DbNull,
      },
    });

    return {
      tasksDetached: detachedTasks.count,
      schedulesPaused: pausedSchedules.count,
    };
  });

  if (!result) {
    return failure(
      409,
      "DEPLOYMENT_STATE_CHANGED",
      "Deployment state changed before it could be deactivated",
    );
  }

  return success(200, {
    deployment: {
      id: deployment.id,
      status: "INACTIVE",
      tasksDetached: result.tasksDetached,
      schedulesPaused: result.schedulesPaused,
    },
  });
}
