import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const taskCount = vi.hoisted(() => vi.fn<(args: unknown) => Promise<number>>());
const taskFindMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown[]>>());
const dbNull = vi.hoisted(() => Symbol("DbNull"));

const prisma = vi.hoisted(() => ({
  task: {
    count: taskCount,
    findMany: taskFindMany,
  },
}));

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: dbNull,
  },
  prisma,
}));

const { listTasks } = await import("../../../src/features/tasks/list-tasks.js");

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
    taskCount.mockResolvedValue(1);
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

    const result = await listTasks({
      auth,
      query: {},
    });

    expect(taskFindMany).toHaveBeenCalledWith({
      where: {
        environmentId: "environment-1",
        executionConfig: {
          not: dbNull,
        },
      },
      orderBy: [{ slug: "asc" }, { id: "asc" }],
      take: 51,
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

    expect(taskCount).toHaveBeenCalledWith({
      where: {
        environmentId: "environment-1",
        executionConfig: {
          not: dbNull,
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
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      },
    });
  });

  it("returns an empty task list when the environment has no tasks", async () => {
    taskCount.mockResolvedValue(0);
    taskFindMany.mockResolvedValue([]);

    await expect(
      listTasks({
        auth,
        query: {},
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      tasks: [],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 0,
      },
    });
  });

  it("applies search, deployment, and cursor filters", async () => {
    taskCount.mockResolvedValue(1);
    taskFindMany.mockResolvedValue([]);

    await expect(
      listTasks({
        auth,
        query: {
          limit: "25",
          search: "hello",
          deploymentId: "11111111-1111-4111-8111-111111111111",
          cursor:
            "eyJ2ZXJzaW9uIjoxLCJraW5kIjoidGFza3Mtc2x1Zy1hc2MiLCJ2YWx1ZXMiOlsiaGVsbG8iLCIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiXX0",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      pagination: {
        limit: 25,
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      },
    });

    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              environmentId: "environment-1",
              executionConfig: {
                not: dbNull,
              },
              deploymentId: "11111111-1111-4111-8111-111111111111",
              OR: [
                {
                  slug: {
                    contains: "hello",
                    mode: "insensitive",
                  },
                },
                {
                  name: {
                    contains: "hello",
                    mode: "insensitive",
                  },
                },
              ],
            },
            {
              OR: [
                {
                  slug: {
                    gt: "hello",
                  },
                },
                {
                  slug: "hello",
                  id: {
                    gt: "11111111-1111-4111-8111-111111111111",
                  },
                },
              ],
            },
          ],
        },
        orderBy: [{ slug: "asc" }, { id: "asc" }],
        take: 26,
      }),
    );
  });

  it("rejects invalid task list filters without querying Prisma", async () => {
    await expect(
      listTasks({
        auth,
        query: {
          deploymentId: "not-a-uuid",
        },
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "deploymentId must be a valid UUID",
      },
    });

    expect(taskFindMany).not.toHaveBeenCalled();
    expect(taskCount).not.toHaveBeenCalled();
  });
});
