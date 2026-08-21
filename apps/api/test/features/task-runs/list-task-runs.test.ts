import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  taskRun: {
    count: vi.fn<(input: unknown) => Promise<number>>(),
    findMany: vi.fn<(input: unknown) => Promise<unknown[]>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { listTaskRuns } = await import("../../../src/features/task-runs/list-task-runs.js");

const TASK_ID = "11111111-1111-4111-8111-111111111111";

const auth = {
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [],
};

function createRun(id: string, createdAt: string) {
  return {
    id,
    status: "COMPLETED",
    createdAt: new Date(createdAt),
    startedAt: null,
    lastHeartbeatAt: null,
    completedAt: null,
    task: {
      id: TASK_ID,
      slug: "hello",
      name: "Hello",
      environment: {
        id: "environment-1",
        slug: "dev",
        name: "Development",
        project: {
          id: "project-1",
          slug: "cascade",
          name: "Cascade",
        },
      },
    },
    _count: {
      attempts: 0,
      events: 0,
    },
  };
}

describe("listTaskRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a page, a total count, and a next cursor", async () => {
    prisma.taskRun.count.mockResolvedValue(3);
    prisma.taskRun.findMany.mockResolvedValue([
      createRun("run-3", "2026-01-03T00:00:00.000Z"),
      createRun("run-2", "2026-01-02T00:00:00.000Z"),
    ]);

    const result = await listTaskRuns({
      auth,
      query: {
        limit: "1",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      taskRuns: [
        {
          id: "run-3",
        },
      ],
      pagination: {
        limit: 1,
        hasMore: true,
        totalCount: 3,
      },
    });

    if (!result.ok) {
      throw new Error("Expected successful result");
    }

    expect(typeof result.pagination.nextCursor).toBe("string");

    expect(prisma.taskRun.count).toHaveBeenCalledWith({
      where: {
        task: {
          environmentId: "environment-1",
        },
      },
    });

    expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          task: {
            environmentId: "environment-1",
          },
        },
        take: 2,
      }),
    );
  });

  it("applies status, task, date, and cursor filters", async () => {
    prisma.taskRun.count.mockResolvedValue(1);
    prisma.taskRun.findMany.mockResolvedValue([]);

    const result = await listTaskRuns({
      auth,
      query: {
        limit: "25",
        status: "FAILED",
        taskId: TASK_ID,
        createdAfter: "2026-01-01T00:00:00.000Z",
        createdBefore: "2026-01-31T00:00:00.000Z",
        cursor:
          "eyJ2ZXJzaW9uIjoxLCJraW5kIjoicnVucy1jcmVhdGVkLWF0LWRlc2MiLCJ2YWx1ZXMiOlsiMjAyNi0wMS0xNVQwMDowMDowMC4wMDBaIiwicnVuLTEiXX0",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      pagination: {
        limit: 25,
        hasMore: false,
        totalCount: 1,
        nextCursor: null,
      },
    });

    expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          task: {
            environmentId: "environment-1",
          },
          status: "FAILED",
          taskId: TASK_ID,
          createdAt: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lte: new Date("2026-01-31T00:00:00.000Z"),
          },
          OR: [
            {
              createdAt: {
                lt: new Date("2026-01-15T00:00:00.000Z"),
              },
            },
            {
              createdAt: new Date("2026-01-15T00:00:00.000Z"),
              id: {
                lt: "run-1",
              },
            },
          ],
        },
        take: 26,
      }),
    );
  });

  it("rejects invalid list query values without querying the database", async () => {
    const result = await listTaskRuns({
      auth,
      query: {
        status: "UNKNOWN",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "status must be one of PENDING, EXECUTING, COMPLETED, FAILED, or CANCELED",
      },
    });

    expect(prisma.taskRun.findMany).not.toHaveBeenCalled();
    expect(prisma.taskRun.count).not.toHaveBeenCalled();
  });
});
