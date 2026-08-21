import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { failure, success } from "../../lib/service-result.js";
import { parseDeploymentBody } from "./deployment-request.js";

type CreateDeploymentInput = {
  auth: ApiAuthContext;
  body: unknown;
};

function isDeploymentVersionConflict(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    (error as { code?: unknown }).code !== "P2002"
  ) {
    return false;
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;

  if (Array.isArray(target)) {
    return target.includes("environmentId") && target.includes("version");
  }

  return target === "Deployment_environmentId_version_key";
}

function getOmittedTaskWhere(input: {
  environmentId: string;
  deployedSlugs: string[];
}): Prisma.TaskWhereInput {
  return {
    environmentId: input.environmentId,
    deploymentId: {
      not: null,
    },
    slug: {
      notIn: input.deployedSlugs,
    },
  };
}

export async function createDeployment(input: CreateDeploymentInput) {
  const parsed = parseDeploymentBody(input.body);

  if (!parsed.ok) {
    return parsed;
  }

  let deployment;

  try {
    deployment = await prisma.$transaction(async (tx) => {
      await tx.deployment.updateMany({
        where: {
          environmentId: input.auth.environmentId,
          status: "ACTIVE",
        },
        data: {
          status: "INACTIVE",
        },
      });

      const createdDeployment = await tx.deployment.create({
        data: {
          environmentId: input.auth.environmentId,
          version: parsed.deployment.version,
          image: parsed.deployment.image,
          status: "ACTIVE",
          manifestTasks: {
            create: parsed.deployment.tasks.map((task) => ({
              slug: task.slug,
              name: task.name,
              description: task.description,
              executionConfig: task.executionConfig as Prisma.InputJsonValue,
            })),
          },
        },
      });

      const omittedTaskWhere = getOmittedTaskWhere({
        environmentId: input.auth.environmentId,
        deployedSlugs: parsed.deployment.tasks.map((task) => task.slug),
      });

      await tx.taskSchedule.updateMany({
        where: {
          task: omittedTaskWhere,
        },
        data: {
          enabled: false,
          revision: {
            increment: 1,
          },
          lockedAt: null,
        },
      });

      await tx.task.updateMany({
        where: omittedTaskWhere,
        data: {
          deploymentId: null,
          executionConfig: Prisma.DbNull,
        },
      });

      const deployedTasks = await Promise.all(
        parsed.deployment.tasks.map((task) =>
          tx.task.upsert({
            where: {
              environmentId_slug: {
                environmentId: input.auth.environmentId,
                slug: task.slug,
              },
            },
            create: {
              environmentId: input.auth.environmentId,
              deploymentId: createdDeployment.id,
              slug: task.slug,
              name: task.name,
              description: task.description,
              executionConfig: task.executionConfig as Prisma.InputJsonValue,
            },
            update: {
              deploymentId: createdDeployment.id,
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

      await tx.taskSchedule.updateMany({
        where: {
          taskId: {
            in: deployedTasks.map((task) => task.id),
          },
        },
        data: {
          revision: {
            increment: 1,
          },
          lockedAt: null,
        },
      });

      return tx.deployment.findUniqueOrThrow({
        where: {
          id: createdDeployment.id,
        },
        include: {
          tasks: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
            orderBy: {
              slug: "asc",
            },
          },
        },
      });
    });
  } catch (error) {
    if (isDeploymentVersionConflict(error)) {
      return failure(
        409,
        "DEPLOYMENT_VERSION_EXISTS",
        "A deployment with this version already exists in the environment",
      );
    }

    throw error;
  }

  return success(201, {
    deployment: {
      id: deployment.id,
      environmentId: deployment.environmentId,
      version: deployment.version,
      image: deployment.image,
      status: deployment.status,
      tasks: deployment.tasks,
      createdAt: deployment.createdAt.toISOString(),
    },
  });
}
