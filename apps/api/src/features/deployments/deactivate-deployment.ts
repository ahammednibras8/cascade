import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";

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

type DeactivateDeploymentFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: {
    code: string;
    message: string;
  };
};

export type DeactivateDeploymentResult = DeactivateDeploymentSuccess | DeactivateDeploymentFailure;

export async function deactivateDeployment(
  input: DeactivateDeploymentInput,
): Promise<DeactivateDeploymentResult> {
  if (!isUuid(input.deploymentId)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_DEPLOYMENT_ID",
        message: "deploymentId must be a valid UUID",
      },
    };
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
    return {
      ok: false,
      status: 404,
      error: {
        code: "DEPLOYMENT_NOT_FOUND",
        message: "Deployment was not found in this environment",
      },
    };
  }

  if (deployment.status === "INACTIVE") {
    return {
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_ALREADY_INACTIVE",
        message: "Deployment is already inactive",
      },
    };
  }

  if (deployment.status !== "ACTIVE") {
    return {
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_NOT_DEACTIVATABLE",
        message: `Cannot deactivate a deployment with status ${deployment.status}`,
      },
    };
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
    return {
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_STATE_CHANGED",
        message: "Deployment state changed before it could be deactivated",
      },
    };
  }

  return {
    ok: true,
    status: 200,
    deployment: {
      id: deployment.id,
      status: "INACTIVE",
      tasksDetached: result.tasksDetached,
      schedulesPaused: result.schedulesPaused,
    },
  };
}
