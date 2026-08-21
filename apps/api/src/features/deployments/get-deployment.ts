import { prisma } from "@cascade/database";
import type { Prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success } from "../../lib/service-result.js";

const deploymentDetailSelect = {
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
  manifestTasks: {
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
    },
  },
  _count: {
    select: {
      runs: true,
      manifestTasks: true,
    },
  },
} satisfies Prisma.DeploymentSelect;

type DeploymentDetail = Prisma.DeploymentGetPayload<{
  select: typeof deploymentDetailSelect;
}>;

function mapManifestTask(task: DeploymentDetail["manifestTasks"][number]) {
  return {
    id: task.id,
    slug: task.slug,
    name: task.name,
    description: task.description,
    executionConfig: task.executionConfig,
    createdAt: task.createdAt.toISOString(),
  };
}

function mapDeploymentTask(task: DeploymentDetail["tasks"][number]) {
  return {
    id: task.id,
    slug: task.slug,
    name: task.name,
    description: task.description,
    executionConfig: task.executionConfig,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    runsCount: task._count.runs,
    schedulesCount: task._count.schedules,
  };
}

function mapDeploymentDetail(deployment: DeploymentDetail) {
  return {
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
    canRollback: deployment.status === "INACTIVE" && deployment._count.manifestTasks > 0,
    manifestTasks: deployment.manifestTasks.map(mapManifestTask),
    tasks: deployment.tasks.map(mapDeploymentTask),
  };
}

export async function getDeployment(input: {
  auth: ApiAuthContext;
  deploymentId: string | undefined;
}) {
  if (!isUuid(input.deploymentId)) {
    return failure(400, "INVALID_DEPLOYMENT_ID", "deploymentId must be a valid UUID");
  }

  const deployment = await prisma.deployment.findFirst({
    where: {
      id: input.deploymentId,
      environmentId: input.auth.environmentId,
    },
    select: deploymentDetailSelect,
  });

  if (!deployment) {
    return failure(404, "DEPLOYMENT_NOT_FOUND", "Deployment was not found in this environment");
  }

  return success(200, {
    deployment: mapDeploymentDetail(deployment),
  });
}
