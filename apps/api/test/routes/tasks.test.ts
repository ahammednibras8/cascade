import express from "express";
import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "11111111-1111-4111-8111-111111111111";

const triggerTaskRun = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const cancelTaskRun = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const replayTaskRun = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const createTaskSchedule = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const createDeployment = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const getTaskRun = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const listTaskRunEvents = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const prisma = vi.hoisted(() => ({
  taskRun: {
    findMany: vi.fn<(input: unknown) => Promise<unknown[]>>(),
  },
}));

vi.mock("../../src/services/trigger-task-run.js", () => ({
  triggerTaskRun,
}));

vi.mock("../../src/services/cancel-task-run.js", () => ({
  cancelTaskRun,
}));

vi.mock("../../src/services/replay-task-run.js", () => ({
  replayTaskRun,
}));

vi.mock("../../src/services/create-task-schedule.js", () => ({
  createTaskSchedule,
}));

vi.mock("../../src/services/create-deployment.js", () => ({
  createDeployment,
}));

vi.mock("../../src/services/get-task-run.js", () => ({
  getTaskRun,
}));

vi.mock("../../src/services/list-task-run-events.js", () => ({
  listTaskRunEvents,
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { tasksRouter } = await import("../../src/routes/tasks.js");

function createApp() {
  const app = express();

  app.use(express.json());

  app.use((request, _response, next) => {
    request.auth = {
      apiKeyId: "api-key-1",
      environmentId: "environment-1",
      projectId: "project-1",
    };

    next();
  });

  app.use("/api", tasksRouter);

  return app;
}

describe("tasksRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes deployment registration requests to the deployment service", async () => {
    createDeployment.mockResolvedValue({
      ok: true,
      status: 201,
      deployment: {
        id: "deployment-1",
        environmentId: "environment-1",
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        status: "ACTIVE",
        tasks: [
          {
            id: "task-1",
            slug: "hello",
            name: "Hello",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const body = {
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      tasks: [
        {
          slug: "hello",
          name: "Hello",
        },
      ],
    };

    const response = await httpRequest(createApp()).post("/api/deployments").send(body);

    expect(response.status).toBe(201);

    expect(createDeployment).toHaveBeenCalledWith({
      auth: {
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
      },
      body,
    });

    expect(response.body.deployment).toEqual({
      id: "deployment-1",
      environmentId: "environment-1",
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      status: "ACTIVE",
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("passes Idempotency-Key to the trigger service and returns replay metadata", async () => {
    triggerTaskRun.mockResolvedValue({
      ok: true,
      status: 200,
      idempotentReplayed: true,
      taskRun: {
        id: "run-1",
        taskId: "11111111-1111-4111-8111-111111111111",
        taskSlug: "hello",
        taskName: "Hello",
        status: "PENDING",
        payload: {
          message: "hello",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        idempotentReplay: true,
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
      },
    });

    const response = await httpRequest(createApp())
      .post("/api/tasks/11111111-1111-4111-8111-111111111111/trigger")
      .set("Idempotency-Key", "trigger-request-1")
      .send({
        payload: {
          message: "hello",
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers["idempotent-replayed"]).toBe("true");

    expect(triggerTaskRun).toHaveBeenCalledWith({
      auth: {
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
      },
      taskId: "11111111-1111-4111-8111-111111111111",
      body: {
        payload: {
          message: "hello",
        },
      },
      idempotencyKey: "trigger-request-1",
      traceparent: undefined,
    });

    expect(response.body.taskRun.idempotentReplay).toBe(true);
  });

  it("passes task slugs to the trigger service", async () => {
    triggerTaskRun.mockResolvedValue({
      ok: true,
      status: 202,
      idempotentReplayed: false,
      taskRun: {
        id: "run-1",
        taskId: TASK_ID,
        taskSlug: "hello",
        taskName: "Hello",
        status: "PENDING",
        payload: {
          name: "Nibras",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        idempotentReplay: false,
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
      },
    });

    const response = await httpRequest(createApp())
      .post("/api/tasks/slug/hello/trigger")
      .set("Authorization", "Bearer test")
      .send({
        payload: {
          name: "Nibras",
        },
      });

    expect(response.status).toBe(202);

    expect(triggerTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        taskSlug: "hello",
      }),
    );
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
      auth: {
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
      },
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
      auth: {
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
      },
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

  it("passes cancel run requests to the cancel service", async () => {
    cancelTaskRun.mockResolvedValue({
      ok: true,
      status: 200,
      taskRun: {
        id: RUN_ID,
        taskId: TASK_ID,
        status: "CANCELED",
        canceled: true,
        alreadyCanceled: false,
      },
    });

    const response = await httpRequest(createApp()).post(`/api/runs/${RUN_ID}/cancel`).send();

    expect(response.status).toBe(200);

    expect(cancelTaskRun).toHaveBeenCalledWith({
      auth: {
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
      },
      runId: RUN_ID,
    });

    expect(response.body).toEqual({
      taskRun: {
        id: RUN_ID,
        taskId: TASK_ID,
        status: "CANCELED",
        canceled: true,
        alreadyCanceled: false,
      },
    });
  });

  it("passes replay run requests to the replay service", async () => {
    replayTaskRun.mockResolvedValue({
      ok: true,
      status: 202,
      taskRun: {
        id: "33333333-3333-4333-8333-333333333333",
        taskId: TASK_ID,
        status: "PENDING",
        payload: {
          message: "hello",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        replayedFromRunId: RUN_ID,
      },
    });

    const response = await httpRequest(createApp()).post(`/api/runs/${RUN_ID}/replay`).send();

    expect(response.status).toBe(202);

    expect(replayTaskRun).toHaveBeenCalledWith({
      auth: {
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
      },
      runId: RUN_ID,
    });

    expect(response.body).toEqual({
      taskRun: {
        id: "33333333-3333-4333-8333-333333333333",
        taskId: TASK_ID,
        status: "PENDING",
        payload: {
          message: "hello",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        replayedFromRunId: RUN_ID,
      },
    });
  });

  it("passes create schedule requests to the schedule service", async () => {
    createTaskSchedule.mockResolvedValue({
      ok: true,
      status: 201,
      schedule: {
        id: "33333333-3333-4333-8333-333333333333",
        taskId: TASK_ID,
        name: "Every minute",
        intervalSeconds: 60,
        nextRunAt: "2026-01-01T00:01:00.000Z",
        enabled: true,
        payload: {
          message: "scheduled hello",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const body = {
      name: "Every minute",
      intervalSeconds: 60,
      startAt: "2026-01-01T00:01:00.000Z",
      payload: {
        message: "scheduled hello",
      },
    };

    const response = await httpRequest(createApp())
      .post(`/api/tasks/${TASK_ID}/schedules`)
      .send(body);

    expect(response.status).toBe(201);

    expect(createTaskSchedule).toHaveBeenCalledWith({
      auth: {
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
      },
      taskId: TASK_ID,
      body,
    });

    expect(response.body.schedule.name).toBe("Every minute");
  });
});
