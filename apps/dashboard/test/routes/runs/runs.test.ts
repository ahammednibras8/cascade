import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("~/lib/api/cascade-api.server", () => ({
  cascadeDashboardApiRequest,
}));

const { loader } = await import("../../../app/routes/runs/runs.js");

describe("runs loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns latest task runs for the table", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      taskRuns: [
        {
          id: "run-1",
          status: "EXECUTING",
          createdAt: "2026-01-01T00:00:00.000Z",
          startedAt: "2026-01-01T00:00:05.000Z",
          lastHeartbeatAt: null,
          completedAt: null,
          task: {
            id: "task-1",
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
          attemptsCount: 1,
          eventsCount: 3,
        },
      ],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      },
    });

    const result = await loader({ request: new Request("http://dashboard.test/runs") } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/runs",
      expect.objectContaining({
        responseSchema: expect.any(Object),
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
    cascadeDashboardApiRequest.mockResolvedValue({
      taskRuns: [],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 0,
      },
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/runs") } as never),
    ).resolves.toEqual({
      runs: [],
    });
  });
});
