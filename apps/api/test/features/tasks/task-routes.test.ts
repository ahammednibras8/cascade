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
  getTask,
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
  createGetTaskSuccess,
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
  error: { code: "FORBIDDEN", message: "API key is missing the required permission" },
};

type HttpMethod = "delete" | "get" | "post" | "put";
type RouteService = { mock: { calls: unknown[][] }; mockResolvedValue(value: unknown): unknown };

function appRequest(scopes?: string[]) {
  return httpRequest(createApp(scopes ? { scopes: scopes as never[] } : undefined));
}

function request(method: HttpMethod, path: string, scopes?: string[]) {
  const scopedRequest = appRequest(scopes);
  return scopedRequest[method](path);
}

function schedulePath(suffix = "") {
  return `/api/schedules/${SCHEDULE_ID}${suffix}`;
}

function expectAuthOnly(service: RouteService) {
  expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT });
}

function expectForbidden(response: { body: unknown; status: number }) {
  expect(response.status).toBe(403);
  expect(response.body).toEqual(FORBIDDEN);
}

async function expectScopeRejection(input: {
  method: HttpMethod;
  path: string;
  service: RouteService;
}) {
  const response = await request(input.method, input.path, ["TASKS_READ"]).send({
    intervalSeconds: 120,
  });

  expectForbidden(response);
  expect(input.service).not.toHaveBeenCalled();
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
      ["cancel", cancelTaskRun, createCancelTaskRunSuccess(), 200],
      ["replay", replayTaskRun, createReplayTaskRunSuccess(), 202],
    ] as const)(
      "passes %s run requests to the service",
      async (action, service, result, status) => {
        service.mockResolvedValue(result);

        const response = await appRequest().post(`/api/runs/${RUN_ID}/${action}`).send();

        expect(response.status).toBe(status);
        expect(service).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, runId: RUN_ID });
      },
    );
  });

  describe("task reads", () => {
    it("passes task list requests to the task list service", async () => {
      listTasks.mockResolvedValue(createListTasksSuccess());

      const response = await appRequest().get("/api/tasks");

      expect(response.status).toBe(200);
      expectAuthOnly(listTasks);
      expect(response.body.tasks[0]).toMatchObject({
        id: "task-1",
        runsCount: 3,
        schedulesCount: 2,
        slug: "hello",
      });
    });

    it("passes task detail requests to the task detail service", async () => {
      getTask.mockResolvedValue(createGetTaskSuccess());

      const response = await appRequest().get(`/api/tasks/${TASK_ID}`);

      expect(response.status).toBe(200);
      expect(getTask).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, taskId: TASK_ID });
      expect(response.body.task).toMatchObject({
        id: TASK_ID,
        deployment: { version: "v1" },
        runsCount: 3,
        schedulesCount: 1,
        slug: "hello",
      });
    });

    it("returns task-detail errors from the service", async () => {
      const error = {
        code: "TASK_NOT_FOUND",
        message: "Task was not found in this environment",
      };
      getTask.mockResolvedValue({ ok: false, status: 404, error });

      const response = await appRequest().get(`/api/tasks/${TASK_ID}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error });
    });

    it("rejects task detail without TASKS_READ", async () => {
      const response = await appRequest([]).get(`/api/tasks/${TASK_ID}`);

      expectForbidden(response);
      expect(getTask).not.toHaveBeenCalled();
    });
  });

  describe("schedule routes", () => {
    it("passes create schedule requests to the schedule service", async () => {
      createTaskSchedule.mockResolvedValue(createTaskScheduleSuccess());

      const body = {
        intervalSeconds: 60,
        name: "Every minute",
        payload: { message: "scheduled hello" },
        startAt: "2026-01-01T00:01:00.000Z",
      };
      const response = await appRequest().post(`/api/tasks/${TASK_ID}/schedules`).send(body);

      expect(response.status).toBe(201);
      expect(createTaskSchedule).toHaveBeenCalledWith({
        auth: AUTH_CONTEXT,
        body,
        taskId: TASK_ID,
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

      const body = { intervalSeconds: 120, name: "Every two minutes" };
      const response = await appRequest().put(schedulePath()).send(body);

      expect(response.status).toBe(200);
      expect(updateTaskSchedule).toHaveBeenCalledWith({
        auth: AUTH_CONTEXT,
        body,
        scheduleId: SCHEDULE_ID,
      });
      expect(response.body.schedule).toMatchObject({
        id: SCHEDULE_ID,
        intervalSeconds: 120,
        revision: 2,
      });
    });
  });

  describe("schedule permissions", () => {
    it.each([
      ["list", "get", "/api/schedules", listTaskSchedules],
      ["detail", "get", schedulePath(), getTaskSchedule],
      ["pause", "post", schedulePath("/pause"), pauseTaskSchedule],
      ["resume", "post", schedulePath("/resume"), resumeTaskSchedule],
      ["delete", "delete", schedulePath(), deleteTaskSchedule],
      ["update", "put", schedulePath(), updateTaskSchedule],
    ] as const)(
      "rejects %s schedule requests without SCHEDULES_WRITE",
      async (_, method, path, service) => {
        expect.hasAssertions();
        await expectScopeRejection({ method, path, service });
      },
    );
  });
});
