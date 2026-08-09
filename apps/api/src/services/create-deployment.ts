import { parseTaskExecutionConfig, type TaskExecutionConfig } from "@cascade/core";
import { prisma, type Prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";

type CreateDeploymentInput = {
  auth: ApiAuthContext;
  body: unknown;
};

type DeploymentTaskInput = {
  slug: string;
  name: string;
  description: string | null;
  executionConfig: TaskExecutionConfig;
};

const MAX_DEPLOYMENT_VERSION_LENGTH = 120;
const MAX_DEPLOYMENT_IMAGE_LENGTH = 512;
const MAX_DEPLOYMENT_TASKS = 100;
const MAX_TASK_SLUG_LENGTH = 120;
const MAX_TASK_NAME_LENGTH = 200;
const MAX_TASK_DESCRIPTION_LENGTH = 4_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidDepoloymentBody(code: string, message: string) {
  return {
    ok: false as const,
    status: 400,
    error: {
      code,
      message,
    },
  };
}

function getTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

function parseDeploymentBody(body: unknown) {
  if (!isRecord(body)) {
    return invalidDepoloymentBody("INVALID_BODY", "Body must be an object");
  }

  const version = getTrimmedString(body.version);

  if (!version || version.length > MAX_DEPLOYMENT_VERSION_LENGTH) {
    return invalidDepoloymentBody(
      "INVALID_VERSION",
      `version must be a non-empty string with at most ${MAX_DEPLOYMENT_VERSION_LENGTH} characters`,
    );
  }

  const image = getTrimmedString(body.image);

  if (!image || image.length > MAX_DEPLOYMENT_IMAGE_LENGTH || /\s/.test(image)) {
    return invalidDepoloymentBody(
      "INVALID_IMAGE",
      `image must be a whitespace-free string with at most ${MAX_DEPLOYMENT_IMAGE_LENGTH} characters`,
    );
  }

  const { tasks } = body;

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return invalidDepoloymentBody("INVALID_TASKS", "tasks must be a non-empty array");
  }

  if (tasks.length > MAX_DEPLOYMENT_TASKS) {
    return invalidDepoloymentBody(
      "INVALID_TASKS",
      `tasks must contain at most ${MAX_DEPLOYMENT_TASKS} items`,
    );
  }

  const parsedTaks: DeploymentTaskInput[] = [];
  const tasksSlug = new Set<string>();

  for (const task of tasks) {
    if (!isRecord(task)) {
      return invalidDepoloymentBody("INVALID_TASK", "Each task must be an object");
    }

    const slug = getTrimmedString(task.slug);

    if (!slug || slug.length > MAX_TASK_SLUG_LENGTH) {
      return invalidDepoloymentBody(
        "INVALID_TASK",
        `task.slug must be a non-empty string with at most ${MAX_TASK_SLUG_LENGTH} characters`,
      );
    }

    if (tasksSlug.has(slug)) {
      return invalidDepoloymentBody(
        "DUPLICATE_TASK_SLUG",
        "tasks must not contain duplicate task.slug values",
      );
    }

    tasksSlug.add(slug);

    let name = slug;

    if (task.name !== undefined) {
      const explicitName = getTrimmedString(task.name);

      if (!explicitName || explicitName.length > MAX_TASK_NAME_LENGTH) {
        return invalidDepoloymentBody(
          "INVALID_TASK_NAME",
          `task.name must be a non-empty string with at most ${MAX_TASK_NAME_LENGTH} characters`,
        );
      }

      name = explicitName;
    }

    let description: string | null = null;

    if (task.description !== undefined && task.description !== null) {
      if (
        typeof task.description !== "string" ||
        task.description.length > MAX_TASK_DESCRIPTION_LENGTH
      ) {
        return invalidDepoloymentBody(
          "INVALID_TASK_DESCRIPTION",
          `task.description must be a string with at most ${MAX_TASK_DESCRIPTION_LENGTH} characters`,
        );
      }

      description = task.description;
    }

    const executionConfig = parseTaskExecutionConfig(task.executionConfig);

    if (!executionConfig) {
      return invalidDepoloymentBody(
        "INVALID_TASK_EXECUTION_CONFIG",
        "task.executionConfig must contain schemaVersion, timeoutMs, retry, and queue settings",
      );
    }

    parsedTaks.push({
      slug,
      name,
      description,
      executionConfig,
    });
  }

  return {
    ok: true as const,
    deployment: {
      version,
      image,
      tasks: parsedTaks,
    },
  };
}

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
      return {
        ok: false as const,
        status: 409,
        error: {
          code: "DEPLOYMENT_VERSION_EXISTS",
          message: "A deployment with this version already exists in the environment",
        },
      };
    }

    throw error;
  }

  return {
    ok: true as const,
    status: 201,
    deployment: {
      id: deployment.id,
      environmentId: deployment.environmentId,
      version: deployment.version,
      image: deployment.image,
      status: deployment.status,
      tasks: deployment.tasks,
      createdAt: deployment.createdAt.toISOString(),
    },
  };
}
