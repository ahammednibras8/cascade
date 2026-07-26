import express from "express";
import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerTaskRun = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const cancelTaskRun = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const replayTaskRun = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const createTaskSchedule = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const createDeployment = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

vi.mock("../services/trigger-task-run.js", () => ({
  triggerTaskRun,
}));

vi.mock("../services/cancel-task-run.js", () => ({
  cancelTaskRun,
}));

vi.mock("../services/replay-task-run.js", () => ({
  replayTaskRun,
}));

vi.mock("../services/create-task-schedule.js", () => ({
  createTaskSchedule,
}));

vi.mock("../services/create-deployment.js", () => ({
  createDeployment,
}));

const { tasksRouter } = await import("./tasks.js");

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
});
