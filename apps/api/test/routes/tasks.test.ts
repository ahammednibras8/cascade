import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_CONTEXT,
  RUN_ID,
  TASK_ID,
  cancelTaskRun,
  createApp,
  createApiKey,
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
  listApiKeys,
  listTasks,
  replayTaskRun,
  triggerTaskRun,
  revokeApiKey,
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

  it("rejects deployment creation when the API key lacks DEPLOYMENTS_WRITE", async () => {
    const response = await httpRequest(createApp({ scopes: [] }))
      .post("/api/deployments")
      .send(createDeploymentBody());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(createDeployment).not.toHaveBeenCalled();
  });

  it("lists API keys for an API-key manager", async () => {
    listApiKeys.mockResolvedValue({
      status: 200,
      apiKeys: [
        {
          id: "key-1",
          name: "GitHub deploy",
          keyPrefix: "csc_dev_abc123",
          scopes: ["DEPLOYMENTS_WRITE"],
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-08-03T00:00:00.000Z",
          rotatedFromId: null,
        },
      ],
    });

    const response = await httpRequest(createApp()).get("/api/api-keys");

    expect(response.status).toBe(200);
    expect(listApiKeys).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
    });
    expect(response.body.apiKeys).toEqual([
      {
        id: "key-1",
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: "2026-08-03T00:00:00.000Z",
        rotatedFromId: null,
      },
    ]);
    expect(response.body.availableScopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "API_KEYS_MANAGE",
        }),
      ]),
    );
  });

  it("rejects API-key listing when the key lacks API_KEYS_MANAGE", async () => {
    const response = await httpRequest(createApp({ scopes: ["RUNS_READ"] })).get("/api/api-keys");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it("creates an API key for an API-key manager", async () => {
    createApiKey.mockResolvedValue({
      ok: true,
      status: 201,
      apiKey: {
        id: "key-1",
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: "2026-08-03T00:00:00.000Z",
        rotatedFromId: null,
      },
      token: "csc_dev_test_token_not_a_real_secret",
    });

    const body = {
      name: "GitHub deploy",
      scopes: ["DEPLOYMENTS_WRITE"],
    };

    const response = await httpRequest(createApp()).post("/api/api-keys").send(body);

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(createApiKey).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      body,
    });
    expect(response.body).toEqual({
      apiKey: {
        id: "key-1",
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: "2026-08-03T00:00:00.000Z",
        rotatedFromId: null,
      },
      token: "csc_dev_test_token_not_a_real_secret",
    });
  });

  it("returns validation errors from API key creation", async () => {
    createApiKey.mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_API_KEY_SCOPES",
        message: "scopes must be a non-empty array",
      },
    });

    const response = await httpRequest(createApp()).post("/api/api-keys").send({
      name: "Empty scopes",
      scopes: [],
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_API_KEY_SCOPES",
        message: "scopes must be a non-empty array",
      },
    });
  });

  it("revokes an API key for an API-key manager", async () => {
    const apiKeyId = "33333333-3333-4333-8333-333333333333";

    revokeApiKey.mockResolvedValue({
      ok: true,
      status: 200,
      apiKey: {
        id: apiKeyId,
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: null,
        revokedAt: "2026-08-03T01:00:00.000Z",
        createdAt: "2026-08-03T00:00:00.000Z",
        rotatedFromId: null,
      },
    });

    const response = await httpRequest(createApp()).post(`/api/api-keys/${apiKeyId}/revoke`);

    expect(response.status).toBe(200);
    expect(revokeApiKey).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      apiKeyId,
    });
    expect(response.body.apiKey).toMatchObject({
      id: apiKeyId,
      revokedAt: "2026-08-03T01:00:00.000Z",
    });
  });

  it("returns revoke errors from the API-key service", async () => {
    const apiKeyId = "33333333-3333-4333-8333-333333333333";

    revokeApiKey.mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        code: "CANNOT_REVOKE_CURRENT_API_KEY",
        message: "An API key cannot revoke itself",
      },
    });

    const response = await httpRequest(createApp()).post(`/api/api-keys/${apiKeyId}/revoke`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "CANNOT_REVOKE_CURRENT_API_KEY",
        message: "An API key cannot revoke itself",
      },
    });
  });
});
