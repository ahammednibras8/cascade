import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: unknown) => Promise<unknown>>(),
);

vi.mock("~/lib/api/cascade-api.server", () => ({
  cascadeDashboardApiRequest,
}));

const { loader } = await import("../../../app/routes/tasks/task-detail.js");

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function routeArgs(taskId = TASK_ID) {
  return {
    params: {
      taskId,
    },
    request: new Request(`http://dashboard.test/tasks/${taskId}`),
  } as never;
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    slug: "hello",
    name: "Hello",
    description: "Greets a user",
    executionConfig: {
      schemaVersion: 1,
      timeoutMs: 30_000,
      retry: {
        maxAttempts: 3,
        delayMs: 1_000,
        exponentialBackoff: true,
      },
      queue: {
        name: "hello",
        concurrencyLimit: 2,
      },
    },
    deployment: {
      id: "deployment-1",
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      status: "ACTIVE",
      runtimeStatus: "RUNNING",
    },
    runsCount: 3,
    schedulesCount: 1,
    schedules: [],
    recentRuns: [],
    createdAt: "2026-08-16T09:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    ...overrides,
  };
}

describe("task detail loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns task detail from the Cascade API", async () => {
    const result = task();

    cascadeDashboardApiRequest.mockResolvedValue({
      task: result,
    });

    await expect(loader(routeArgs())).resolves.toEqual({
      task: result,
      taskId: TASK_ID,
    });

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/tasks/${TASK_ID}`,
      expect.objectContaining({
        responseSchema: expect.any(Object),
      }),
    );
  });

  it("validates task detail with the shared API response schema", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      task: task(),
    });

    await loader(routeArgs());

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/tasks/${TASK_ID}`,
      expect.objectContaining({
        responseSchema: expect.any(Object),
      }),
    );
  });

  it("URL-encodes the task ID before calling the API", async () => {
    const taskId = "task/with spaces";

    cascadeDashboardApiRequest.mockResolvedValue({
      task: task({
        id: taskId,
      }),
    });

    await loader(routeArgs(taskId));

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/tasks/task%2Fwith%20spaces",
      expect.objectContaining({
        responseSchema: expect.any(Object),
      }),
    );
  });

  it("returns null when the task does not exist", async () => {
    cascadeDashboardApiRequest.mockRejectedValue({
      status: 404,
      responseBody: {
        error: {
          code: "TASK_NOT_FOUND",
        },
      },
    });

    await expect(loader(routeArgs())).resolves.toEqual({
      task: null,
      taskId: TASK_ID,
    });
  });

  it("rethrows API failures other than TASK_NOT_FOUND", async () => {
    const error = {
      status: 500,
      responseBody: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
        },
      },
    };

    cascadeDashboardApiRequest.mockRejectedValue(error);

    await expect(loader(routeArgs())).rejects.toBe(error);
  });
});
