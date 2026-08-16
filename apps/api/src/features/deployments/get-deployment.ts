import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";

export async function getDeployment(input: {
  auth: ApiAuthContext;
  deploymentId: string | undefined;
}) {
  if (!isUuid(input.deploymentId)) {
    return {
      ok: false as const,
      status: 400 as const,
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
      environmentId: true,
      version: true,
      image: true,
      status: true,
      runtimeStatus: true,
      runtimeError: true,
      runtimeStartedAt: true,
      runtimeStoppedAt: true,
      createdAt: true,
      updatedAt: true,
      tasks: {
        orderBy: {
          slug: "asc",
        },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          executionConfig: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              runs: true,
              schedules: true,
            },
          },
        },
      },
      _count: {
        select: {
          runs: true,
        },
      },
    },
  });

  if (!deployment) {
    return {
      ok: false as const,
      status: 404 as const,
      error: {
        code: "DEPLOYMENT_NOT_FOUND",
        message: "Deployment was not found in this environment",
      },
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    deployment: {
      id: deployment.id,
      environmentId: deployment.environmentId,
      version: deployment.version,
      image: deployment.image,
      status: deployment.status,
      runtimeStatus: deployment.runtimeStatus,
      runtimeError: deployment.runtimeError,
      runtimeStartedAt: deployment.runtimeStartedAt?.toISOString() ?? null,
      runtimeStoppedAt: deployment.runtimeStoppedAt?.toISOString() ?? null,
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
      runsCount: deployment._count.runs,
      tasks: deployment.tasks.map((task) => ({
        id: task.id,
        slug: task.slug,
        name: task.name,
        description: task.description,
        executionConfig: task.executionConfig,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        runsCount: task._count.runs,
        schedulesCount: task._count.schedules,
      })),
    },
  };
}
