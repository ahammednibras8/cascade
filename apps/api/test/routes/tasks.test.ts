import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_CONTEXT,
  RUN_ID,
  TASK_ID,
  cancelTaskRun,
  createApp,
  createDeployment,
  createTaskSchedule,
  listTasks,
  replayTaskRun,
  triggerTaskRun,
} from "./tasks-router-harness.js";

describe("tasksRouter write routes", () => {
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
      auth: AUTH_CONTEXT,
      body,
    });
    expect(response.body.deployment.id).toBe("deployment-1");
  });

  it("passes Idempotency-Key to the trigger service and returns replay metadata", async () => {
    triggerTaskRun.mockResolvedValue({
      ok: true,
      status: 200,
      idempotentReplayed: true,
      taskRun: {
        id: "run-1",
        taskId: TASK_ID,
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
      .post(`/api/tasks/${TASK_ID}/trigger`)
      .set("Idempotency-Key", "trigger-request-1")
      .send({
        payload: {
          message: "hello",
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers["idempotent-replayed"]).toBe("true");
    expect(triggerTaskRun).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      taskId: TASK_ID,
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
      auth: AUTH_CONTEXT,
      runId: RUN_ID,
    });
    expect(response.body.taskRun.status).toBe("CANCELED");
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
      auth: AUTH_CONTEXT,
      runId: RUN_ID,
    });
    expect(response.body.taskRun.replayedFromRunId).toBe(RUN_ID);
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
      auth: AUTH_CONTEXT,
      taskId: TASK_ID,
      body,
    });
    expect(response.body.schedule.name).toBe("Every minute");
  });

  it("passes task list requests to the task list service", async () => {
    listTasks.mockResolvedValue({
      ok: true,
      status: 200,
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

    const response = await httpRequest(createApp()).get("/api/tasks");

    expect(response.status).toBe(200);
    expect(listTasks).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
    });
    expect(response.body.tasks[0]).toMatchObject({
      id: "task-1",
      slug: "hello",
      runsCount: 3,
      schedulesCount: 2,
    });
  });
});
