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
  deleteTaskSchedule,
  listTaskSchedules,
  listTasks,
  pauseTaskSchedule,
  replayTaskRun,
  resumeTaskSchedule,
  triggerTaskRun,
} from "./tasks-router-harness.js";
import {
  createCancelTaskRunSuccess,
  createDeleteTaskScheduleSuccess,
  createDeploymentBody,
  createDeploymentSuccess,
  createDeploymentVersionExistsFailure,
  createListTaskSchedulesSuccess,
  createListTasksSuccess,
  createPauseTaskScheduleSuccess,
  createReplayTaskRunSuccess,
  createResumeTaskScheduleSuccess,
  createTaskScheduleSuccess,
  createTriggerTaskRunSuccess,
} from "./tasks-router-fixtures.js";

const SCHEDULE_ID = "33333333-3333-4333-8333-333333333333";
const FORBIDDEN = {
  error: {
    code: "FORBIDDEN",
    message: "API key is missing the required permission",
  },
};

function appRequest(scopes?: string[]) {
  return httpRequest(createApp(scopes ? { scopes: scopes as never[] } : undefined));
}

function expectAuthOnly(service: { mock: { calls: unknown[][] } }) {
  expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT });
}

describe("tasksRouter write routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes deployment registration requests to the deployment service", async () => {
    createDeployment.mockResolvedValue(createDeploymentSuccess());

    const body = createDeploymentBody();
    const response = await appRequest().post("/api/deployments").send(body);

    expect(response.status).toBe(201);
    expect(createDeployment).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, body });
    expect(response.body.deployment.id).toBe("deployment-1");
  });

  it("returns deployment version conflicts from the deployment service", async () => {
    createDeployment.mockResolvedValue(createDeploymentVersionExistsFailure());

    const response = await appRequest()
      .post("/api/deployments")
      .send(createDeploymentBody({ version: "local-worker-test-001" }));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DEPLOYMENT_VERSION_EXISTS");
  });

  it("rejects deployment creation without DEPLOYMENTS_WRITE", async () => {
    const response = await appRequest([]).post("/api/deployments").send(createDeploymentBody());

    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
    expect(createDeployment).not.toHaveBeenCalled();
  });

  it("passes Idempotency-Key to the trigger service and returns replay metadata", async () => {
    triggerTaskRun.mockResolvedValue(
      createTriggerTaskRunSuccess({ status: 200, idempotentReplayed: true }),
    );

    const body = { payload: { message: "hello" } };
    const response = await appRequest()
      .post(`/api/tasks/${TASK_ID}/trigger`)
      .set("Idempotency-Key", "trigger-request-1")
      .send(body);

    expect(response.status).toBe(200);
    expect(response.headers["idempotent-replayed"]).toBe("true");
    expect(triggerTaskRun).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      taskId: TASK_ID,
      body,
      idempotencyKey: "trigger-request-1",
      traceparent: undefined,
    });
    expect(response.body.taskRun.idempotentReplay).toBe(true);
  });

  it("passes task slugs to the trigger service", async () => {
    triggerTaskRun.mockResolvedValue(createTriggerTaskRunSuccess({ payload: { name: "Nibras" } }));

    const response = await appRequest()
      .post("/api/tasks/slug/hello/trigger")
      .set("Authorization", "Bearer test")
      .send({ payload: { name: "Nibras" } });

    expect(response.status).toBe(202);
    expect(triggerTaskRun).toHaveBeenCalledWith(expect.objectContaining({ taskSlug: "hello" }));
  });

  it.each([
    ["cancel", "post", `/api/runs/${RUN_ID}/cancel`, cancelTaskRun, createCancelTaskRunSuccess()],
    ["replay", "post", `/api/runs/${RUN_ID}/replay`, replayTaskRun, createReplayTaskRunSuccess()],
  ] as const)("passes %s run requests to the service", async (_, method, path, service, result) => {
    service.mockResolvedValue(result);

    const response = await appRequest()[method](path).send();

    expect(response.status).toBe(result.status);
    expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, runId: RUN_ID });
  });

  it("passes create schedule requests to the schedule service", async () => {
    createTaskSchedule.mockResolvedValue(createTaskScheduleSuccess());

    const body = {
      name: "Every minute",
      intervalSeconds: 60,
      startAt: "2026-01-01T00:01:00.000Z",
      payload: { message: "scheduled hello" },
    };
    const response = await appRequest().post(`/api/tasks/${TASK_ID}/schedules`).send(body);

    expect(response.status).toBe(201);
    expect(createTaskSchedule).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, taskId: TASK_ID, body });
    expect(response.body.schedule.name).toBe("Every minute");
  });

  it("passes task list requests to the task list service", async () => {
    listTasks.mockResolvedValue(createListTasksSuccess());

    const response = await appRequest().get("/api/tasks");

    expect(response.status).toBe(200);
    expectAuthOnly(listTasks);
    expect(response.body.tasks[0]).toMatchObject({
      id: "task-1",
      slug: "hello",
      runsCount: 3,
      schedulesCount: 2,
    });
  });

  it("passes schedule list requests to the schedule list service", async () => {
    listTaskSchedules.mockResolvedValue(createListTaskSchedulesSuccess());

    const response = await appRequest().get("/api/schedules");

    expect(response.status).toBe(200);
    expectAuthOnly(listTaskSchedules);
    expect(response.body.schedules[0]).toMatchObject({
      id: "schedule-1",
      scheduleType: "CRON",
      task: { slug: "hello" },
    });
  });

  it("rejects schedule list requests without SCHEDULES_WRITE", async () => {
    const response = await appRequest(["TASKS_READ"]).get("/api/schedules");

    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
    expect(listTaskSchedules).not.toHaveBeenCalled();
  });

  it.each([
    ["pause", pauseTaskSchedule, createPauseTaskScheduleSuccess(), { enabled: false }],
    [
      "resume",
      resumeTaskSchedule,
      createResumeTaskScheduleSuccess(),
      { enabled: true, nextRunAt: "2026-01-01T00:01:00.000Z" },
    ],
  ] as const)(
    "passes %s schedule requests to the service",
    async (action, service, result, body) => {
      service.mockResolvedValue(result);

      const response = await appRequest().post(`/api/schedules/${SCHEDULE_ID}/${action}`);

      expect(response.status).toBe(200);
      expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, scheduleId: SCHEDULE_ID });
      expect(response.body.schedule).toMatchObject({ id: SCHEDULE_ID, ...body });
    },
  );

  it.each([
    ["pause", pauseTaskSchedule],
    ["resume", resumeTaskSchedule],
  ] as const)("rejects %s schedule requests without SCHEDULES_WRITE", async (action, service) => {
    const response = await appRequest(["TASKS_READ"]).post(
      `/api/schedules/${SCHEDULE_ID}/${action}`,
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual(FORBIDDEN);
    expect(service).not.toHaveBeenCalled();
  });

  it("passes delete schedule requests to the delete service", async () => {
    deleteTaskSchedule.mockResolvedValue(createDeleteTaskScheduleSuccess());

    const scheduleId = "33333333-3333-4333-8333-333333333333";

    const response = await httpRequest(createApp()).delete(`/api/schedules/${scheduleId}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(deleteTaskSchedule).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      scheduleId,
    });
  });

  it("rejects delete schedule requests without SCHEDULES_WRITE", async () => {
    const response = await httpRequest(
      createApp({
        scopes: ["TASKS_READ"],
      }),
    ).delete(`/api/schedules/33333333-3333-4333-8333-333333333333`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(deleteTaskSchedule).not.toHaveBeenCalled();
  });
});
