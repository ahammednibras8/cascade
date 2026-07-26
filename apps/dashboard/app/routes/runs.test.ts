import { beforeEach, describe, expect, it, vi } from "vitest";

type DbRun = {
  id: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  lastHeartbeatAt: Date | null;
  completedAt: Date | null;
  task: {
    slug: string;
    name: string;
    environment: {
      slug: string;
      project: {
        slug: string;
        name: string;
      };
    };
  };
  _count: {
    attempts: number;
    events: number;
  };
};

const taskRunFindMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<DbRun[]>>());

vi.mock("@cascade/database", () => ({
  prisma: {
    taskRun: {
      findMany: taskRunFindMany,
    },
  },
}));

const { loader } = await import("./runs.js");

describe("runs loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns latest task runs for the table", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const startedAt = new Date("2026-01-01T00:00:05.000Z");

    taskRunFindMany.mockResolvedValue([
      {
        id: "run-1",
        status: "EXECUTING",
        createdAt,
        startedAt,
        lastHeartbeatAt: null,
        completedAt: null,
        task: {
          slug: "hello",
          name: "Hello",
          environment: {
            slug: "dev",
            project: {
              slug: "cascade",
              name: "Cascade",
            },
          },
        },
        _count: {
          attempts: 1,
          events: 3,
        },
      },
    ]);

    const result = await loader();

    expect(taskRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      }),
    );

    expect(result).toEqual({
      runs: [
        {
          id: "run-1",
          status: "EXECUTING",
          taskSlug: "hello",
          taskName: "Hello",
          environmentSlug: "dev",
          projectSlug: "cascade",
          projectName: "Cascade",
          attemptsCount: 1,
          eventsCount: 3,
          createdAt: "2026-01-01T00:00:00.000Z",
          startedAt: "2026-01-01T00:00:05.000Z",
          lastHeartbeatAt: null,
          completedAt: null,
        },
      ],
    });
  });

  it("returns an empty runs list", async () => {
    taskRunFindMany.mockResolvedValue([]);

    await expect(loader()).resolves.toEqual({
      runs: [],
    });
  });
});
