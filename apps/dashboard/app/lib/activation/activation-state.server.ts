import { ApiKeyScope, prisma } from "@cascade/database";
import { getDashboardSession } from "../auth/dashboard-session.server";
import { getDashboardWorkspaceContext } from "../workspace/dashboard-workspace.server";

const ACTIVATION_API_KEY_SCOPES = [
  ApiKeyScope.DEPLOYMENTS_WRITE,
  ApiKeyScope.TASKS_TRIGGER,
  ApiKeyScope.RUNS_READ,
] as const;

export type DashboardActivationState =
  | {
      state: "AUTH_REQUIRED";
    }
  | {
      state: "WORKSPACE_REQUIRED";
    }
  | {
      state: "CREDENTIAL_REQUIRED";
      environmentId: string;
    }
  | {
      state: "STARTER_REQUIRED";
      environmentId: string;
    }
  | {
      state: "DEPLOYMENT_PENDING";
      deploymentId: string;
      environmentId: string;
      runtimeStatus: "PENDING" | "STARTING" | "DRAINING" | "STOPPED" | "FAILED";
    }
  | {
      state: "FIRST_RUN_PENDING";
      deploymentId: string;
      environmentId: string;
    }
  | {
      state: "ACTIVATED";
      deploymentId: string;
      environmentId: string;
    };

export async function resolveDashboardActivationState(
  request: Request,
): Promise<DashboardActivationState> {
  const session = await getDashboardSession(request);

  if (!session) {
    return {
      state: "AUTH_REQUIRED",
    };
  }

  const workspace = await getDashboardWorkspaceContext(request, session.userId);
  const activeEnvironment = workspace.activeEnvironment;

  if (!activeEnvironment) {
    return {
      state: "WORKSPACE_REQUIRED",
    };
  }

  return resolveWorkspaceActivationState(activeEnvironment.id, session.userId);
}

async function resolveWorkspaceActivationState(
  environmentId: string,
  userId: string,
): Promise<DashboardActivationState> {
  const environment = await findActivationEnvironment(environmentId, userId);

  if (!environment) {
    return {
      state: "WORKSPACE_REQUIRED",
    };
  }

  if (environment.apiKeys.length === 0) {
    return {
      state: "CREDENTIAL_REQUIRED",
      environmentId: environment.id,
    };
  }

  const deployment = environment.deployments[0];

  if (!deployment || deployment.tasks.length === 0) {
    return {
      state: "STARTER_REQUIRED",
      environmentId: environment.id,
    };
  }

  if (deployment.runtimeStatus !== "RUNNING") {
    return {
      state: "DEPLOYMENT_PENDING",
      deploymentId: deployment.id,
      environmentId: environment.id,
      runtimeStatus: deployment.runtimeStatus,
    };
  }

  const hasCompletedRun = await hasCompletedDeploymentRun(deployment.id, environment.id);

  if (!hasCompletedRun) {
    return {
      state: "FIRST_RUN_PENDING",
      deploymentId: deployment.id,
      environmentId: environment.id,
    };
  }

  return {
    state: "ACTIVATED",
    deploymentId: deployment.id,
    environmentId: environment.id,
  };
}

function findActivationEnvironment(environmentId: string, userId: string) {
  return prisma.environment.findFirst({
    where: {
      id: environmentId,
      project: {
        organization: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
    },
    select: {
      id: true,
      apiKeys: {
        where: {
          revokedAt: null,
          scopes: {
            hasEvery: [...ACTIVATION_API_KEY_SCOPES],
          },
        },
        select: {
          id: true,
        },
        take: 1,
      },
      deployments: {
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          runtimeStatus: true,
          tasks: {
            select: {
              id: true,
            },
            take: 1,
          },
        },
        take: 1,
      },
    },
  });
}

async function hasCompletedDeploymentRun(deploymentId: string, environmentId: string) {
  const completedRun = await prisma.taskRun.findFirst({
    where: {
      deploymentId,
      environmentId,
      status: "COMPLETED",
    },
    select: {
      id: true,
    },
  });

  return completedRun !== null;
}
