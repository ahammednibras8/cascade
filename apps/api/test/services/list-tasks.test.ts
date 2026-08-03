import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

const taskFindMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown[]>>());

const prisma = vi.hoisted(() => ({
  task: {
    findMany: taskFindMany,
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { listTasks } = await import("../../src/services/list-tasks.js");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

describe("listTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists tasks only from the authenticated environment", async () => {
    taskFindMany.mockResolvedValue([
      {
        id: "task-1",
        slug: "hello",
        name: "Hello",
        description: "Greets a user",
        deployment: {
          id: "deployment-1",
          version: "v1",
          status: "ACTIVE",
        },
        _count: {
          runs: 3,
          schedules: 2,
        },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const result = await listTasks({ auth });

    expect(taskFindMany).toHaveBeenCalledWith({
      where: {
        environmentId: "environment-1",
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

    expect(result).toEqual({
      ok: true,
      status: 200,
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          description: "Greets a user",
          deployment: {
            id: "deployment-1",
            version: "v1",
            status: "ACTIVE",
          },
          runsCount: 3,
          schedulesCount: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
  });

  it("returns an empty task list when the environment has no tasks", async () => {
    taskFindMany.mockResolvedValue([]);

    await expect(listTasks({ auth })).resolves.toEqual({
      ok: true,
      status: 200,
      tasks: [],
    });
  });
});
