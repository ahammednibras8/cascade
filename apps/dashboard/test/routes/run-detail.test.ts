import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>());

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { loader } = await import("../../app/routes/run-detail.js");

describe("run detail loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the run and its events from the API", async () => {
    cascadeApiRequest
      .mockResolvedValueOnce({
        taskRun: {
          id: "run-1",
          status: "FAILED",
          payload: {
            message: "hello",
          },
          output: {
            partial: true,
          },
          error: {
            code: "TASK_FAILED",
            message: "Task failed",
          },
          traceId: "trace-1",
          triggerSpanId: "span-1",
          startedAt: "2026-01-01T00:00:05.000Z",
          lastHeartbeatAt: "2026-01-01T00:00:10.000Z",
          completedAt: "2026-01-01T00:00:15.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:16.000Z",
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
          attempts: [
            {
              id: "attempt-1",
              attemptNumber: 1,
              status: "FAILED",
              error: {
                message: "Task failed",
              },
              startedAt: "2026-01-01T00:00:05.000Z",
              completedAt: "2026-01-01T00:00:15.000Z",
              createdAt: "2026-01-01T00:00:05.000Z",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        events: [
          {
            id: "event-1",
            taskAttemptId: "attempt-1",
            type: "task.log",
            level: "ERROR",
            message: "Task failed once",
            data: {
              retryable: true,
            },
            createdAt: "2026-01-01T00:00:12.000Z",
            traceId: "trace-1",
            spanId: "span-2",
            parentSpanId: "span-1",
          },
        ],
      });

    const result = await loader({
      params: {
        runId: "run-1",
      },
    } as never);

    expect(cascadeApiRequest).toHaveBeenNthCalledWith(1, "/api/runs/run-1");
    expect(cascadeApiRequest).toHaveBeenNthCalledWith(2, "/api/runs/run-1/events");

    expect(result.run).toMatchObject({
      id: "run-1",
      status: "FAILED",
      attempts: [
        {
          id: "attempt-1",
          status: "FAILED",
        },
      ],
      events: [
        {
          id: "event-1",
          type: "task.log",
          level: "ERROR",
        },
      ],
    });
  });

  it("passes through a missing-run error from the API", async () => {
    cascadeApiRequest.mockRejectedValueOnce({
      status: 404,
    });

    await expect(
      loader({
        params: {
          runId: "missing-run",
        },
      } as never),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
