import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

const RUN_ID = "22222222-2222-4222-8222-222222222222";

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const taskRunFindFirst = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());
const taskEventFindMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown[]>>());
const taskEventFindFirst = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const prisma = vi.hoisted(() => ({
  taskRun: {
    findFirst: taskRunFindFirst,
  },
  taskEvent: {
    findFirst: taskEventFindFirst,
    findMany: taskEventFindMany,
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { getTaskRun } = await import("../../src/services/get-task-run.js");
const { listTaskRunEvents } = await import("../../src/services/list-task-run-events.js");

describe("task run read services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes task attempt status correctly", async () => {
    taskRunFindFirst.mockResolvedValue({
      id: RUN_ID,
      status: "COMPLETED",
      deploymentId: null,
      scheduleId: null,
      payload: { message: "hello" },
      output: { ok: true },
      error: null,
      delayUntil: null,
      startedAt: new Date("2026-01-01T00:00:01.000Z"),
      lastHeartbeatAt: null,
      completedAt: new Date("2026-01-01T00:00:02.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:03.000Z"),
      traceId: "trace-1",
      triggerSpanId: "span-1",
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
      _count: {
        attempts: 1,
        events: 0,
      },
      attempts: [
        {
          id: "attempt-1",
          attemptNumber: 1,
          status: "COMPLETED",
          error: null,
          startedAt: new Date("2026-01-01T00:00:01.000Z"),
          completedAt: new Date("2026-01-01T00:00:02.000Z"),
          createdAt: new Date("2026-01-01T00:00:01.000Z"),
        },
      ],
    });

    const result = await getTaskRun({
      auth,
      runId: RUN_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      taskRun: {
        attempts: [
          {
            id: "attempt-1",
            status: "COMPLETED",
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("starus");
  });

  it("returns a scoped not-found result when the run is outside the environment", async () => {
    taskRunFindFirst.mockResolvedValue(null);

    await expect(
      getTaskRun({
        auth,
        runId: RUN_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Task run was not found in this environment",
      },
    });
  });

  it("serializes event span ids independently from trace ids", async () => {
    taskRunFindFirst.mockResolvedValue({
      id: RUN_ID,
    });
    taskEventFindMany.mockResolvedValue([
      {
        id: "event-1",
        taskAttemptId: "attempt-1",
        type: "task.log",
        level: "INFO",
        message: "hello",
        data: { ok: true },
        traceId: "trace-1",
        spanId: "span-2",
        parentSpanId: "span-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    await expect(
      listTaskRunEvents({
        auth,
        runId: RUN_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      events: [
        {
          id: "event-1",
          taskAttemptId: "attempt-1",
          type: "task.log",
          level: "INFO",
          message: "hello",
          data: { ok: true },
          traceId: "trace-1",
          spanId: "span-2",
          parentSpanId: "span-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: "event-1",
      hasMore: false,
    });
  });

  it("returns only events after a valid cursor", async () => {
    const cursorId = "33333333-3333-4333-8333-333333333333";
    const eventId = "44444444-4444-4444-8444-444444444444";
    const cursorTime = new Date("2026-01-01T00:00:00.000Z");

    taskRunFindFirst.mockResolvedValue({
      id: RUN_ID,
    });

    taskEventFindFirst.mockResolvedValue({
      id: cursorId,
      createdAt: cursorTime,
    });

    taskEventFindMany.mockResolvedValue([
      {
        id: eventId,
        taskAttemptId: null,
        type: "task.log",
        level: "INFO",
        message: "new event",
        data: null,
        traceId: null,
        spanId: null,
        parentSpanId: null,
        createdAt: new Date("2026-01-01T00:00:01.000Z"),
      },
    ]);

    await expect(
      listTaskRunEvents({
        auth,
        runId: RUN_ID,
        afterEventId: cursorId,
      }),
    ).resolves.toMatchObject({
      ok: true,
      events: [{ id: eventId }],
      nextCursor: eventId,
      hasMore: false,
    });

    expect(taskEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskRunId: RUN_ID,
          OR: [
            {
              createdAt: {
                gt: cursorTime,
              },
            },
            {
              createdAt: cursorTime,
              id: {
                gt: cursorId,
              },
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 101,
      }),
    );
  });
});
