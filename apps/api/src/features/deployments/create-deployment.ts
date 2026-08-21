import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { failure, success } from "../../lib/service-result.js";
import { parseDeploymentBody } from "./deployment-request.js";

type CreateDeploymentInput = {
  auth: ApiAuthContext;
  body: unknown;
};

type ParsedDeployment = Extract<ReturnType<typeof parseDeploymentBody>, { ok: true }>["deployment"];
type DeploymentTransaction = Prisma.TransactionClient;

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

async function deactivateCurrentDeployment(tx: DeploymentTransaction, environmentId: string) {
  await tx.deployment.updateMany({
    where: {
      environmentId,
      status: "ACTIVE",
    },
    data: {
      status: "INACTIVE",
    },
  });
}

async function createDeploymentRecord(
  tx: DeploymentTransaction,
  environmentId: string,
  deployment: ParsedDeployment,
) {
  return tx.deployment.create({
    data: {
      environmentId,
      version: deployment.version,
      image: deployment.image,
      status: "ACTIVE",
      manifestTasks: {
        create: deployment.tasks.map((task) => ({
          slug: task.slug,
          name: task.name,
          description: task.description,
          executionConfig: task.executionConfig as Prisma.InputJsonValue,
        })),
      },
    },
  });
}

async function pauseOmittedTaskSchedules(
  tx: DeploymentTransaction,
  omittedTaskWhere: Prisma.TaskWhereInput,
) {
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
}

async function detachOmittedTasks(
  tx: DeploymentTransaction,
  omittedTaskWhere: Prisma.TaskWhereInput,
) {
  await tx.task.updateMany({
    where: omittedTaskWhere,
    data: {
      deploymentId: null,
      executionConfig: Prisma.DbNull,
    },
  });
}

async function upsertDeploymentTasks(input: {
  tx: DeploymentTransaction;
  environmentId: string;
  deploymentId: string;
  deployment: ParsedDeployment;
}) {
  return Promise.all(
    input.deployment.tasks.map((task) =>
      input.tx.task.upsert({
        where: {
          environmentId_slug: {
            environmentId: input.environmentId,
            slug: task.slug,
          },
        },
        create: {
          environmentId: input.environmentId,
          deploymentId: input.deploymentId,
          slug: task.slug,
          name: task.name,
          description: task.description,
          executionConfig: task.executionConfig as Prisma.InputJsonValue,
        },
        update: {
          deploymentId: input.deploymentId,
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

async function unlockTaskSchedules(
  tx: DeploymentTransaction,
  deployedTasks: Array<{ id: string }>,
) {
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
}

function loadDeploymentWithTasks(tx: DeploymentTransaction, deploymentId: string) {
  return tx.deployment.findUniqueOrThrow({
    where: {
      id: deploymentId,
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
}

async function createDeploymentInTransaction(input: {
  environmentId: string;
  deployment: ParsedDeployment;
}) {
  return prisma.$transaction(async (tx) => {
    await deactivateCurrentDeployment(tx, input.environmentId);

    const createdDeployment = await createDeploymentRecord(
      tx,
      input.environmentId,
      input.deployment,
    );
    const omittedTaskWhere = getOmittedTaskWhere({
      environmentId: input.environmentId,
      deployedSlugs: input.deployment.tasks.map((task) => task.slug),
    });

    await pauseOmittedTaskSchedules(tx, omittedTaskWhere);
    await detachOmittedTasks(tx, omittedTaskWhere);

    const deployedTasks = await upsertDeploymentTasks({
      tx,
      environmentId: input.environmentId,
      deploymentId: createdDeployment.id,
      deployment: input.deployment,
    });

    await unlockTaskSchedules(tx, deployedTasks);

    return loadDeploymentWithTasks(tx, createdDeployment.id);
  });
}

export async function createDeployment(input: CreateDeploymentInput) {
  const parsed = parseDeploymentBody(input.body);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const deployment = await createDeploymentInTransaction({
      environmentId: input.auth.environmentId,
      deployment: parsed.deployment,
    });

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
}
