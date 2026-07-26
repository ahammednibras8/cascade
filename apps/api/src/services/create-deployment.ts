import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";

type CreateDeploymentInput = {
  auth: ApiAuthContext;
  body: unknown;
};

type DeploymentTaskInput = {
  slug: string;
  name: string;
  description: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDeploymentBody(body: unknown) {
  if (!isRecord(body)) {
    return {
      ok: false as const,
      status: 400,
      error: {
        code: "INVALID_BODY",
        message: "Body must be an object",
      },
    };
  }

  const { version, image, tasks } = body;

  if (typeof version !== "string" || version.trim().length === 0) {
    return {
      ok: false as const,
      status: 400,
      error: {
        code: "INVALID_VERSION",
        message: "version must be a non-empty string",
      },
    };
  }

  if (typeof image !== "string" || image.trim().length === 0) {
    return {
      ok: false as const,
      status: 400,
      error: {
        code: "INVALID_IMAGE",
        message: "image must be a non-empty string",
      },
    };
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      ok: false as const,
      status: 400,
      error: {
        code: "INVALID_TASKS",
        message: "tasks must be a non-empty array",
      },
    };
  }

  const parsedTasks: DeploymentTaskInput[] = [];

  for (const task of tasks) {
    if (!isRecord(task)) {
      return {
        ok: false as const,
        status: 400,
        error: {
          code: "INVALID_TASK",
          message: "Each task must be an object",
        },
      };
    }

    if (typeof task.slug !== "string" || task.slug.trim().length === 0) {
      return {
        ok: false as const,
        status: 400,
        error: {
          code: "INVALID_TASK_SLUG",
          message: "task.slug must be a non-empty string",
        },
      };
    }

    parsedTasks.push({
      slug: task.slug.trim(),
      name: typeof task.name === "string" && task.name.trim() ? task.name.trim() : task.slug.trim(),
      description: typeof task.description === "string" ? task.description : null,
    });
  }

  return {
    ok: true as const,
    deployment: {
      version: version.trim(),
      image: image.trim(),
      tasks: parsedTasks,
    },
  };
}

export async function createDeployment(input: CreateDeploymentInput) {
  const parsed = parseDeploymentBody(input.body);

  if (!parsed.ok) {
    return parsed;
  }

  const deployment = await prisma.$transaction(async (tx) => {
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

    await Promise.all(
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
          },
          update: {
            deploymentId: createdDeployment.id,
            name: task.name,
            description: task.description,
          },
        }),
      ),
    );

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
