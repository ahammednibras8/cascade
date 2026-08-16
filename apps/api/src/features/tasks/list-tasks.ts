import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";

export async function listTasks(input: { auth: ApiAuthContext }) {
  const tasks = await prisma.task.findMany({
    where: {
      environmentId: input.auth.environmentId,
      executionConfig: {
        not: Prisma.DbNull,
      },
    },
    orderBy: {
      slug: "asc",
    },
    take: 50,
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      deployment: {
        select: {
          id: true,
          version: true,
          status: true,
        },
      },
      _count: {
        select: {
          runs: true,
          schedules: true,
        },
      },
    },
  });

  return {
    ok: true as const,
    status: 200 as const,
    tasks: tasks.map((task) => ({
      id: task.id,
      slug: task.slug,
      name: task.name,
      description: task.description,
      deployment: task.deployment,
      runsCount: task._count.runs,
      schedulesCount: task._count.schedules,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
  };
}
