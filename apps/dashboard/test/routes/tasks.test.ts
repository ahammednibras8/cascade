import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>());

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { loader } = await import("../../app/routes/tasks.js");

describe("tasks loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tasks from the Cascade API", async () => {
    cascadeApiRequest.mockResolvedValue({
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

    const result = await loader();

    expect(cascadeApiRequest).toHaveBeenCalledWith("/api/tasks");

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
    cascadeApiRequest.mockResolvedValue({
      tasks: [],
    });

    await expect(loader()).resolves.toEqual({
      tasks: [],
    });
  });
});
