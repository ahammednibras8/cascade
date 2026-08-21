import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelTaskRun,
  createApp,
  getTaskRun,
  listTaskRunEvents,
  listTaskRuns,
  replayTaskRun,
  streamEnvironmentRuns,
  streamTaskRunEvents,
} from "./support/task-run-route-harness.js";
import { AUTH_CONTEXT, RUN_ID, TASK_ID } from "../support/route-test-app.js";
import {
  createCancelTaskRunSuccess,
  createReplayTaskRunSuccess,
} from "./support/task-run-route-fixtures.js";

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
      nextCursor: "event-1",
      hasMore: false,
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
    expect(response.body.nextCursor).toBe("event-1");
    expect(response.body.hasMore).toBe(false);
  });

  it("passes an event cursor to the run event service", async () => {
    const eventId = "33333333-3333-4333-8333-333333333333";

    listTaskRunEvents.mockResolvedValue({
      ok: true,
      status: 200,
      events: [],
      nextCursor: eventId,
      hasMore: false,
    });

    const response = await httpRequest(createApp()).get(
      `/api/runs/${RUN_ID}/events?after=${eventId}`,
    );

    expect(response.status).toBe(200);
    expect(listTaskRunEvents).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      runId: RUN_ID,
      afterEventId: eventId,
    });
    expect(response.body).toMatchObject({
      events: [],
      nextCursor: eventId,
      hasMore: false,
    });
  });

  it("lists task runs with pagination metadata", async () => {
    listTaskRuns.mockResolvedValue({
      ok: true,
      status: 200,
      taskRuns: [
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
      ],
      pagination: {
        limit: 25,
        nextCursor: "next-run-cursor",
        hasMore: true,
        totalCount: 77,
      },
    });

    const response = await httpRequest(createApp()).get(
      `/api/runs?limit=25&status=COMPLETED&taskId=${TASK_ID}`,
    );

    expect(response.status).toBe(200);
    expect(listTaskRuns).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      query: {
        limit: "25",
        status: "COMPLETED",
        taskId: TASK_ID,
      },
    });
    expect(response.body).toEqual({
      taskRuns: [
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
      ],
      pagination: {
        limit: 25,
        nextCursor: "next-run-cursor",
        hasMore: true,
        totalCount: 77,
      },
    });
  });

  it("returns list-query validation failures", async () => {
    listTaskRuns.mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "status must be one of PENDING, EXECUTING, COMPLETED, FAILED, or CANCELED",
      },
    });

    const response = await httpRequest(createApp()).get("/api/runs?status=UNKNOWN");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_LIST_QUERY",
        message: "status must be one of PENDING, EXECUTING, COMPLETED, FAILED, or CANCELED",
      },
    });
  });

  it.each([
    ["cancel", cancelTaskRun, createCancelTaskRunSuccess(), 200],
    ["replay", replayTaskRun, createReplayTaskRunSuccess(), 202],
  ] as const)("passes %s run requests to the service", async (action, service, result, status) => {
    service.mockResolvedValue(result);

    const response = await httpRequest(createApp()).post(`/api/runs/${RUN_ID}/${action}`).send();

    expect(response.status).toBe(status);
    expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, runId: RUN_ID });
  });

  it("opens an authenticated event stream and forwards Last-Event-ID", async () => {
    const eventId = "33333333-3333-4333-8333-333333333333";

    streamTaskRunEvents.mockImplementation(async (input) => {
      (
        input as {
          response: {
            status: (status: number) => {
              end: () => void;
            };
          };
        }
      ).response
        .status(200)
        .end();

      return {
        ok: true,
      };
    });

    const response = await httpRequest(createApp())
      .get(`/api/runs/${RUN_ID}/events/stream`)
      .set("Last-Event-ID", eventId);

    expect(response.status).toBe(200);
    expect(streamTaskRunEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: AUTH_CONTEXT,
        runId: RUN_ID,
      }),
    );
  });

  it("returns a stream validation error before opening the connection", async () => {
    streamTaskRunEvents.mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_EVENT_CURSOR",
        message: "after must be a valid event UUID",
      },
    });

    const response = await httpRequest(createApp()).get(`/api/runs/${RUN_ID}/events/stream`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_EVENT_CURSOR",
        message: "after must be a valid event UUID",
      },
    });
  });

  it("opens an authenticated environment runs stream", async () => {
    streamEnvironmentRuns.mockImplementation(async (input) => {
      (
        input as {
          response: {
            status: (status: number) => {
              end: () => void;
            };
          };
        }
      ).response
        .status(200)
        .end();

      return undefined;
    });

    const response = await httpRequest(createApp()).get("/api/runs/stream");

    expect(response.status).toBe(200);
    expect(streamEnvironmentRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: AUTH_CONTEXT,
      }),
    );
  });
});
