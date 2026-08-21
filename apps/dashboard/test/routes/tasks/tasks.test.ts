import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("../../../app/lib/api/cascade-api.server.js", () => ({
  cascadeDashboardApiRequest,
}));

const { loader } = await import("../../../app/routes/tasks/tasks.js");

describe("tasks loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tasks from the Cascade API", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
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

    const result = await loader({ request: new Request("http://dashboard.test/tasks") } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/tasks",
      expect.objectContaining({
        responseSchema: expect.any(Object),
      }),
    );

    expect(result).toEqual({
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

  it("returns an empty list when the API has no tasks", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      tasks: [],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 0,
      },
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/tasks") } as never),
    ).resolves.toEqual({
      tasks: [],
    });
  });
});
