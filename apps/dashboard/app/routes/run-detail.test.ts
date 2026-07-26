import { beforeEach, describe, expect, it, vi } from "vitest";

type DbRunDetail = {
  id: string;
  status: string;
  payload: unknown;
  output: unknown;
  error: unknown;
  traceId: string | null;
  triggerSpanId: string | null;
  idempotencyKeyHash: string | null;
  idempotencyRequestHash: string | null;
  startedAt: Date | null;
  lastHeartbeatAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  task: {
    id: string;
    slug: string;
    name: string;
    environment: {
      id: string;
      slug: string;
      name: string;
      project: {
        id: string;
        slug: string;
        name: string;
      };
    };
  };
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    error: unknown;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }>;
  events: Array<{
    id: string;
    taskAttemptId: string | null;
    type: string;
    level: string;
    message: string | null;
    data: unknown;
    createdAt: Date;
    traceId: string | null;
    spanId: string | null;
    parentSpanId: string | null;
  }>;
};

const taskRunFindUnique = vi.hoisted(() => vi.fn<(args: unknown) => Promise<DbRunDetail | null>>());

vi.mock("@cascade/database", () => ({
  prisma: {
    taskRun: {
      findUnique: taskRunFindUnique,
    },
  },
}));

const { loader } = await import("./run-detail.js");

describe("run detail loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns payload, output, error, attempts, and events", async () => {
    taskRunFindUnique.mockResolvedValue({
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
      idempotencyKeyHash: null,
      idempotencyRequestHash: null,
      startedAt: new Date("2026-01-01T00:00:05.000Z"),
      lastHeartbeatAt: new Date("2026-01-01T00:00:10.000Z"),
      completedAt: new Date("2026-01-01T00:00:15.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:16.000Z"),
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
          startedAt: new Date("2026-01-01T00:00:05.000Z"),
          completedAt: new Date("2026-01-01T00:00:15.000Z"),
          createdAt: new Date("2026-01-01T00:00:05.000Z"),
        },
      ],
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
          createdAt: new Date("2026-01-01T00:00:12.000Z"),
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

    expect(taskRunFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "run-1",
        },
      }),
    );

    expect(result.run).toMatchObject({
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
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:05.000Z",
      lastHeartbeatAt: "2026-01-01T00:00:10.000Z",
      completedAt: "2026-01-01T00:00:15.000Z",
      attempts: [
        expect.objectContaining({
          id: "attempt-1",
          attemptNumber: 1,
          status: "FAILED",
          startedAt: "2026-01-01T00:00:05.000Z",
          completedAt: "2026-01-01T00:00:15.000Z",
        }),
      ],
      events: [
        expect.objectContaining({
          id: "event-1",
          type: "task.log",
          level: "ERROR",
          message: "Task failed once",
          createdAt: "2026-01-01T00:00:12.000Z",
        }),
      ],
    });
  });

  it("throws 404 when the run does not exist", async () => {
    taskRunFindUnique.mockResolvedValue(null);

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
