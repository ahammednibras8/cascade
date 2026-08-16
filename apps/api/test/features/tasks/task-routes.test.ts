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
  getTaskSchedule,
  listTaskSchedules,
  listTasks,
  pauseTaskSchedule,
  replayTaskRun,
  resumeTaskSchedule,
  triggerTaskRun,
  updateTaskSchedule,
} from "./support/tasks-router-harness.js";
import {
  createCancelTaskRunSuccess,
  createDeleteTaskScheduleSuccess,
  createDeploymentBody,
  createDeploymentSuccess,
  createDeploymentVersionExistsFailure,
  createGetTaskScheduleSuccess,
  createListTaskSchedulesSuccess,
  createListTasksSuccess,
  createPauseTaskScheduleSuccess,
  createReplayTaskRunSuccess,
  createResumeTaskScheduleSuccess,
  createTaskScheduleSuccess,
  createTriggerTaskRunSuccess,
  createUpdateTaskScheduleSuccess,
} from "./support/tasks-router-fixtures.js";

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

function schedulePath(suffix = "") {
  return `/api/schedules/${SCHEDULE_ID}${suffix}`;
}

function expectAuthOnly(service: { mock: { calls: unknown[][] } }) {
  expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT });
}

function expectForbidden(response: { status: number; body: unknown }) {
  expect(response.status).toBe(403);
  expect(response.body).toEqual(FORBIDDEN);
}

describe("apiRouter write routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("deployments", () => {
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

      expectForbidden(response);
      expect(createDeployment).not.toHaveBeenCalled();
    });
  });

  describe("task triggers", () => {
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
      triggerTaskRun.mockResolvedValue(
        createTriggerTaskRunSuccess({ payload: { name: "Nibras" } }),
      );

      const response = await appRequest()
        .post("/api/tasks/slug/hello/trigger")
        .set("Authorization", "Bearer test")
        .send({ payload: { name: "Nibras" } });

      expect(response.status).toBe(202);
      expect(triggerTaskRun).toHaveBeenCalledWith(expect.objectContaining({ taskSlug: "hello" }));
    });
  });

  describe("run actions", () => {
    it.each([
      ["cancel", "post", `/api/runs/${RUN_ID}/cancel`, cancelTaskRun, createCancelTaskRunSuccess()],
      ["replay", "post", `/api/runs/${RUN_ID}/replay`, replayTaskRun, createReplayTaskRunSuccess()],
    ] as const)(
      "passes %s run requests to the service",
      async (_, method, path, service, result) => {
        service.mockResolvedValue(result);

        const response = await appRequest()[method](path).send();

        expect(response.status).toBe(result.status);
        expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, runId: RUN_ID });
      },
    );
  });

  describe("tasks and schedules", () => {
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
      expect(createTaskSchedule).toHaveBeenCalledWith({
        auth: AUTH_CONTEXT,
        taskId: TASK_ID,
        body,
      });
      expect(response.body.schedule.name).toBe("Every minute");
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

    it("passes schedule detail requests to the schedule detail service", async () => {
      getTaskSchedule.mockResolvedValue(createGetTaskScheduleSuccess());

      const response = await appRequest().get(schedulePath());

      expect(response.status).toBe(200);
      expect(getTaskSchedule).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, scheduleId: SCHEDULE_ID });
      expect(response.body.schedule).toMatchObject({
        id: SCHEDULE_ID,
        payload: { message: "hello" },
      });
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

        const response = await appRequest().post(schedulePath(`/${action}`));

        expect(response.status).toBe(200);
        expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, scheduleId: SCHEDULE_ID });
        expect(response.body.schedule).toMatchObject({ id: SCHEDULE_ID, ...body });
      },
    );

    it("passes delete schedule requests to the delete service", async () => {
      deleteTaskSchedule.mockResolvedValue(createDeleteTaskScheduleSuccess());

      const response = await appRequest().delete(schedulePath());

      expect(response.status).toBe(204);
      expect(response.text).toBe("");
      expect(deleteTaskSchedule).toHaveBeenCalledWith({
        auth: AUTH_CONTEXT,
        scheduleId: SCHEDULE_ID,
      });
    });

    it("passes update schedule requests to the update service", async () => {
      updateTaskSchedule.mockResolvedValue(createUpdateTaskScheduleSuccess());

      const body = {
        name: "Every two minutes",
        intervalSeconds: 120,
      };
      const response = await appRequest().put(schedulePath()).send(body);

      expect(response.status).toBe(200);
      expect(updateTaskSchedule).toHaveBeenCalledWith({
        auth: AUTH_CONTEXT,
        scheduleId: SCHEDULE_ID,
        body,
      });
      expect(response.body.schedule).toMatchObject({
        id: SCHEDULE_ID,
        intervalSeconds: 120,
        revision: 2,
      });
    });
  });

  describe("schedule permissions", () => {
    it("rejects schedule list requests without SCHEDULES_WRITE", async () => {
      const response = await appRequest(["TASKS_READ"]).get("/api/schedules");

      expectForbidden(response);
      expect(listTaskSchedules).not.toHaveBeenCalled();
    });

    it.each([
      ["pause", "post", schedulePath("/pause"), pauseTaskSchedule],
      ["resume", "post", schedulePath("/resume"), resumeTaskSchedule],
      ["delete", "delete", schedulePath(), deleteTaskSchedule],
      ["update", "put", schedulePath(), updateTaskSchedule],
    ] as const)(
      "rejects %s schedule requests without SCHEDULES_WRITE",
      async (_, method, path, service) => {
        const scopedRequest = appRequest(["TASKS_READ"]);
        const response = await scopedRequest[method](path).send({ intervalSeconds: 120 });

        expectForbidden(response);
        expect(service).not.toHaveBeenCalled();
      },
    );
  });

  it("rejects schedule detail requests without SCHEDULES_WRITE", async () => {
    const response = await httpRequest(
      createApp({
        scopes: ["TASKS_READ"],
      }),
    ).get("/api/schedules/33333333-3333-4333-8333-333333333333");

    expect(response.status).toBe(403);
    expect(getTaskSchedule).not.toHaveBeenCalled();
  });
});
