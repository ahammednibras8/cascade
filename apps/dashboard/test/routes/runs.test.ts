import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>());

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { loader } = await import("../../app/routes/runs.js");

describe("runs loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns latest task runs for the table", async () => {
    cascadeApiRequest.mockResolvedValue({
      taskRuns: [
        {
          id: "run-1",
          status: "EXECUTING",
          createdAt: "2026-01-01T00:00:00.000Z",
          startedAt: "2026-01-01T00:00:05.000Z",
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
          attemptsCount: 1,
          eventsCount: 3,
        },
      ],
    });

    const result = await loader({ request: new Request("http://dashboard.test/runs") } as never);

    expect(cascadeApiRequest).toHaveBeenCalledWith("/api/runs");

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
    cascadeApiRequest.mockResolvedValue({
      taskRuns: [],
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/runs") } as never),
    ).resolves.toEqual({
      runs: [],
    });
  });
});
