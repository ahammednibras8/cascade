import { ApiKeyScope, prisma } from "@cascade/database";
import {
  getDashboardSession,
  type DashboardSessionIdentity,
} from "../auth/dashboard-session.server";
import { getDashboardWorkspaceContext } from "../workspace/dashboard-workspace.server";
import type { DashboardActivationState } from "./activation-state";

const ACTIVATION_API_KEY_SCOPES = [
  ApiKeyScope.DEPLOYMENTS_WRITE,
  ApiKeyScope.TASKS_TRIGGER,
  ApiKeyScope.RUNS_READ,
] as const;

export async function resolveDashboardActivationState(
  request: Request,
  existingSession?: DashboardSessionIdentity | null,
): Promise<DashboardActivationState> {
  const session =
    existingSession === undefined ? await getDashboardSession(request) : existingSession;

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

export async function resolveWorkspaceActivationState(
  environmentId: string,
  userId: string,
): Promise<DashboardActivationState> {
  const environment = await findActivationEnvironment(environmentId, userId);

  if (!environment) {
    return {
      state: "WORKSPACE_REQUIRED",
    };
  }

  if (environment.onboardingRecords.length === 0) {
    await prisma.dashboardOnboarding.upsert({
      where: {
        userId_environmentId: {
          userId,
          environmentId: environment.id,
        },
      },
      update: {},
      create: {
        userId,
        environmentId: environment.id,
        selectedSetupPath: "sdk",
        displayedStep: "activation",
      },
      select: {
        id: true,
      },
    });
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

  await prisma.dashboardOnboarding.updateMany({
    where: {
      userId,
      environmentId: environment.id,
      completedAt: null,
    },
    data: {
      completedAt: new Date(),
    },
  });

  return {
    state: "ACTIVATED",
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
      onboardingRecords: {
        where: {
          userId,
        },
        select: {
          id: true,
        },
        take: 1,
      },
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
