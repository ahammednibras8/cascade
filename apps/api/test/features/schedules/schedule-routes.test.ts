import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApp,
  createTaskSchedule,
  deleteTaskSchedule,
  getTaskSchedule,
  listTaskSchedules,
  pauseTaskSchedule,
  resumeTaskSchedule,
  updateTaskSchedule,
} from "./support/schedule-route-harness.js";
import { AUTH_CONTEXT, TASK_ID } from "../support/route-test-app.js";
import {
  SCHEDULE_ID,
  createDeleteTaskScheduleSuccess,
  createGetTaskScheduleSuccess,
  createListTaskSchedulesSuccess,
  createPauseTaskScheduleSuccess,
  createResumeTaskScheduleSuccess,
  createTaskScheduleSuccess,
  createUpdateTaskScheduleSuccess,
} from "./support/schedule-route-fixtures.js";

const FORBIDDEN = {
  error: { code: "FORBIDDEN", message: "API key is missing the required permission" },
};

type HttpMethod = "delete" | "get" | "post" | "put";
type RouteService = { mock: { calls: unknown[][] }; mockResolvedValue(value: unknown): unknown };

function appRequest(scopes?: string[]) {
  return httpRequest(createApp(scopes ? { scopes: scopes as never[] } : undefined));
}

function request(method: HttpMethod, path: string, scopes?: string[]) {
  return appRequest(scopes)[method](path);
}

function schedulePath(suffix = "") {
  return `/api/schedules/${SCHEDULE_ID}${suffix}`;
}

function expectListSchedulesRequest(service: RouteService, query: Record<string, string> = {}) {
  expect(service).toHaveBeenCalledWith({
    auth: AUTH_CONTEXT,
    query,
  });
}

function expectForbidden(response: { body: unknown; status: number }) {
  expect(response.status).toBe(403);
  expect(response.body).toEqual(FORBIDDEN);
}

async function expectScheduleWriteScopeRejection(input: {
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

describe("schedule routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expectListSchedulesRequest(listTaskSchedules);

    expect(response.body.schedules[0]).toMatchObject({
      id: "schedule-1",
      scheduleType: "CRON",
      task: { slug: "hello" },
    });

    expect(response.body.pagination).toEqual({
      limit: 50,
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    });
  });

  it("passes pagination and filters to the schedule list service", async () => {
    listTaskSchedules.mockResolvedValue(createListTaskSchedulesSuccess());

    const response = await appRequest().get(
      `/api/schedules?limit=25&taskId=${TASK_ID}&enabled=true&scheduleType=CRON&nextRunAfter=2026-01-01T00:00:00.000Z&nextRunBefore=2026-01-31T00:00:00.000Z`,
    );

    expect(response.status).toBe(200);
    expectListSchedulesRequest(listTaskSchedules, {
      limit: "25",
      taskId: TASK_ID,
      enabled: "true",
      scheduleType: "CRON",
      nextRunAfter: "2026-01-01T00:00:00.000Z",
      nextRunBefore: "2026-01-31T00:00:00.000Z",
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

  describe("permissions", () => {
    it.each([
      ["list", "get", "/api/schedules", listTaskSchedules],
      ["detail", "get", schedulePath(), getTaskSchedule],
    ] as const)(
      "rejects %s schedule reads without TASKS_READ",
      async (_, method, path, service) => {
        const response = await request(method, path, []);

        expectForbidden(response);
        expect(service).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["pause", "post", schedulePath("/pause"), pauseTaskSchedule],
      ["resume", "post", schedulePath("/resume"), resumeTaskSchedule],
      ["delete", "delete", schedulePath(), deleteTaskSchedule],
      ["update", "put", schedulePath(), updateTaskSchedule],
    ] as const)(
      "rejects %s schedule requests without SCHEDULES_WRITE",
      async (_, method, path, service) => {
        expect.hasAssertions();
        await expectScheduleWriteScopeRejection({ method, path, service });
      },
    );
  });
});
