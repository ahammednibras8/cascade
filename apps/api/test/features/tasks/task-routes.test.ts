import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, getTask, listTasks, triggerTaskRun } from "./support/task-route-harness.js";
import { AUTH_CONTEXT, TASK_ID } from "../support/route-test-app.js";
import {
  createGetTaskSuccess,
  createListTasksSuccess,
  createTriggerTaskRunSuccess,
} from "./support/task-route-fixtures.js";

const FORBIDDEN = {
  error: { code: "FORBIDDEN", message: "API key is missing the required permission" },
};

function appRequest(scopes?: string[]) {
  return httpRequest(createApp(scopes ? { scopes: scopes as never[] } : undefined));
}

function expectForbidden(response: { body: unknown; status: number }) {
  expect(response.status).toBe(403);
  expect(response.body).toEqual(FORBIDDEN);
}

describe("task routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(response.body.idempotentReplayed).toBe(true);
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

  describe("task reads", () => {
    it("passes task list requests to the task list service", async () => {
      listTasks.mockResolvedValue(createListTasksSuccess());

      const response = await appRequest().get("/api/tasks");

      expect(response.status).toBe(200);
      expect(listTasks).toHaveBeenCalledWith({
        auth: AUTH_CONTEXT,
        query: {},
      });
      expect(response.body.tasks[0]).toMatchObject({
        id: "task-1",
        runsCount: 3,
        schedulesCount: 2,
        slug: "hello",
      });
      expect(response.body.pagination).toEqual({
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      });
    });

    it("passes task list query parameters to the task list service", async () => {
      listTasks.mockResolvedValue(createListTasksSuccess());

      const response = await appRequest().get(
        `/api/tasks?limit=25&search=hello&deploymentId=${TASK_ID}`,
      );

      expect(response.status).toBe(200);
      expect(listTasks).toHaveBeenCalledWith({
        auth: AUTH_CONTEXT,
        query: {
          limit: "25",
          search: "hello",
          deploymentId: TASK_ID,
        },
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
});
