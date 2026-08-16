import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";

export async function listDeployments(input: { auth: ApiAuthContext }) {
  const deployments = await prisma.deployment.findMany({
    where: {
      environmentId: input.auth.environmentId,
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    take: 50,
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
      _count: {
        select: {
          tasks: true,
          runs: true,
        },
      },
    },
  });

  return {
    ok: true as const,
    status: 200 as const,
    deployments: deployments.map((deployment) => ({
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
      tasksCount: deployment._count.tasks,
      runsCount: deployment._count.runs,
    })),
  };
}
