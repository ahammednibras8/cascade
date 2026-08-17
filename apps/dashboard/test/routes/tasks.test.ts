import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeDashboardApiRequest,
}));

const { loader } = await import("../../app/routes/tasks.js");

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
    });

    const result = await loader({ request: new Request("http://dashboard.test/tasks") } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(expect.any(Request), "/api/tasks");

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
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/tasks") } as never),
    ).resolves.toEqual({
      tasks: [],
    });
  });
});
