import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "../../app/routes/run-detail.js";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("~/lib/cascade-api.server", () => ({
  cascadeDashboardApiRequest,
}));

const { loader } = await import("../../app/routes/run-detail.js");

describe("run detail loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the run and its events from the API", async () => {
    cascadeDashboardApiRequest
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
      request: new Request("http://dashboard.test/runs/run-1"),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenNthCalledWith(
      1,
      expect.any(Request),
      "/api/runs/run-1",
    );
    expect(cascadeDashboardApiRequest).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      "/api/runs/run-1/events",
    );

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

  it("returns a not-found state when the API cannot find the run", async () => {
    cascadeDashboardApiRequest.mockRejectedValueOnce({
      status: 404,
      responseBody: {
        error: {
          code: "RUN_NOT_FOUND",
          message: "Task run was not found in this environment",
        },
      },
    });

    await expect(
      loader({
        params: {
          runId: "missing-run",
        },
        request: new Request("http://dashboard.test/runs/missing-run"),
      } as never),
    ).resolves.toEqual({
      run: null,
      runId: "missing-run",
    });

    expect(cascadeDashboardApiRequest).toHaveBeenCalledTimes(1);
    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/runs/missing-run",
    );
  });

  it("sends a cancel request to the API", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      taskRun: {
        id: "run-1",
        status: "CANCELED",
      },
    });

    await action({
      params: {
        runId: "run-1",
      },
      request: new Request("http://localhost/runs/run-1", {
        method: "POST",
        body: new URLSearchParams({
          intent: "cancel",
        }),
      }),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/runs/run-1/cancel",
      {
        method: "POST",
      },
    );
  });

  it("sends a replay request to the API", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      taskRun: {
        id: "run-2",
        status: "PENDING",
      },
    });

    await action({
      params: {
        runId: "run-1",
      },
      request: new Request("http://localhost/runs/run-1", {
        method: "POST",
        body: new URLSearchParams({
          intent: "replay",
        }),
      }),
    } as never);

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/runs/run-1/replay",
      {
        method: "POST",
      },
    );
  });
});
