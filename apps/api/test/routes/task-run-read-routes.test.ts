import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_CONTEXT,
  RUN_ID,
  TASK_ID,
  createApp,
  getTaskRun,
  listTaskRunEvents,
  prisma,
} from "./tasks-router-harness.js";

describe("task run read routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes run status requests to the run status service", async () => {
    getTaskRun.mockResolvedValue({
      ok: true,
      status: 200,
      taskRun: {
        id: RUN_ID,
        task: {
          id: TASK_ID,
          slug: "hello",
          name: "Hello",
        },
        status: "COMPLETED",
        payload: {
          message: "hello",
        },
        output: {
          ok: true,
        },
        error: null,
        attemptsCount: 1,
        eventsCount: 4,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:05.000Z",
      },
    });

    const response = await httpRequest(createApp()).get(`/api/runs/${RUN_ID}`);

    expect(response.status).toBe(200);
    expect(getTaskRun).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      runId: RUN_ID,
    });
    expect(response.body.taskRun).toMatchObject({
      id: RUN_ID,
      status: "COMPLETED",
      attemptsCount: 1,
      eventsCount: 4,
    });
  });

  it("passes run event requests to the run event service", async () => {
    listTaskRunEvents.mockResolvedValue({
      ok: true,
      status: 200,
      events: [
        {
          id: "event-1",
          taskAttemptId: null,
          type: "task.run.completed",
          level: "INFO",
          message: "Task completed",
          data: {
            ok: true,
          },
          traceId: "11111111111111111111111111111111",
          spanId: "2222222222222222",
          parentSpanId: null,
          createdAt: "2026-01-01T00:00:05.000Z",
        },
      ],
    });

    const response = await httpRequest(createApp()).get(`/api/runs/${RUN_ID}/events`);

    expect(response.status).toBe(200);
    expect(listTaskRunEvents).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      runId: RUN_ID,
    });
    expect(response.body.events).toEqual([
      {
        id: "event-1",
        taskAttemptId: null,
        type: "task.run.completed",
        level: "INFO",
        message: "Task completed",
        data: {
          ok: true,
        },
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
        parentSpanId: null,
        createdAt: "2026-01-01T00:00:05.000Z",
      },
    ]);
  });

  it("lists task runs for the authenticated environment", async () => {
    prisma.taskRun.findMany.mockResolvedValue([
      {
        id: RUN_ID,
        status: "COMPLETED",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        startedAt: new Date("2026-01-01T00:00:01.000Z"),
        lastHeartbeatAt: null,
        completedAt: new Date("2026-01-01T00:00:05.000Z"),
        task: {
          id: TASK_ID,
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
          events: 4,
        },
      },
    ]);

    const response = await httpRequest(createApp()).get("/api/runs");

    expect(response.status).toBe(200);
    expect(prisma.taskRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          task: {
            environmentId: "environment-1",
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      }),
    );
    expect(response.body.taskRuns).toEqual([
      {
        id: RUN_ID,
        status: "COMPLETED",
        createdAt: "2026-01-01T00:00:00.000Z",
        startedAt: "2026-01-01T00:00:01.000Z",
        lastHeartbeatAt: null,
        completedAt: "2026-01-01T00:00:05.000Z",
        task: {
          id: TASK_ID,
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
        eventsCount: 4,
      },
    ]);
  });
});
