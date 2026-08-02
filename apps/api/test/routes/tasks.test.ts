import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_CONTEXT,
  RUN_ID,
  TASK_ID,
  cancelTaskRun,
  createApp,
  createCancelTaskRunSuccess,
  createDeployment,
  createDeploymentBody,
  createDeploymentSuccess,
  createDeploymentVersionExistsFailure,
  createListTasksSuccess,
  createReplayTaskRunSuccess,
  createTaskSchedule,
  createTaskScheduleSuccess,
  createTriggerTaskRunSuccess,
  listTasks,
  replayTaskRun,
  triggerTaskRun,
} from "./tasks-router-harness.js";

describe("tasksRouter write routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes deployment registration requests to the deployment service", async () => {
    createDeployment.mockResolvedValue(createDeploymentSuccess());

    const body = createDeploymentBody();

    const response = await httpRequest(createApp()).post("/api/deployments").send(body);

    expect(response.status).toBe(201);
    expect(createDeployment).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      body,
    });
    expect(response.body.deployment.id).toBe("deployment-1");
  });

  it("passes Idempotency-Key to the trigger service and returns replay metadata", async () => {
    triggerTaskRun.mockResolvedValue(
      createTriggerTaskRunSuccess({
        status: 200,
        idempotentReplayed: true,
      }),
    );

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
    triggerTaskRun.mockResolvedValue(
      createTriggerTaskRunSuccess({
        payload: {
          name: "Nibras",
        },
      }),
    );

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
    cancelTaskRun.mockResolvedValue(createCancelTaskRunSuccess());

    const response = await httpRequest(createApp()).post(`/api/runs/${RUN_ID}/cancel`).send();

    expect(response.status).toBe(200);
    expect(cancelTaskRun).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      runId: RUN_ID,
    });
    expect(response.body.taskRun.status).toBe("CANCELED");
  });

  it("passes replay run requests to the replay service", async () => {
    replayTaskRun.mockResolvedValue(createReplayTaskRunSuccess());

    const response = await httpRequest(createApp()).post(`/api/runs/${RUN_ID}/replay`).send();

    expect(response.status).toBe(202);
    expect(replayTaskRun).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      runId: RUN_ID,
    });
    expect(response.body.taskRun.replayedFromRunId).toBe(RUN_ID);
  });

  it("passes create schedule requests to the schedule service", async () => {
    createTaskSchedule.mockResolvedValue(createTaskScheduleSuccess());

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
    listTasks.mockResolvedValue(createListTasksSuccess());

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

  it("returns 409 when a deployment version already exists", async () => {
    createDeployment.mockResolvedValue(createDeploymentVersionExistsFailure());

    const response = await httpRequest(createApp())
      .post("/api/deployments")
      .send(
        createDeploymentBody({
          version: "local-worker-test-001",
          image: "ghcr.io/cascade/worker:local",
        }),
      );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "DEPLOYMENT_VERSION_EXISTS",
        message: "A deployment with this version already exists in the environment",
      },
    });
  });
});
