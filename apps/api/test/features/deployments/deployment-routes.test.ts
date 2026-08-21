import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDeployment,
  createApp,
  getDeployment,
  listDeployments,
} from "./support/deployment-route-harness.js";
import { AUTH_CONTEXT } from "../support/route-test-app.js";
import {
  createDeploymentBody,
  createDeploymentSuccess,
  createDeploymentVersionExistsFailure,
} from "./support/deployment-route-fixtures.js";

const DEPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPLOYMENT_ID,
    environmentId: AUTH_CONTEXT.environmentId,
    version: "v1.2.3",
    image: "ghcr.io/cascade/worker:v1.2.3",
    status: "ACTIVE",
    runtimeStatus: "RUNNING",
    runtimeError: null,
    runtimeStartedAt: "2026-08-16T10:00:00.000Z",
    runtimeStoppedAt: null,
    createdAt: "2026-08-16T09:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    runsCount: 4,
    ...overrides,
  };
}

function deploymentListItem(overrides: Record<string, unknown> = {}) {
  return {
    ...deployment(),
    tasksCount: 2,
    ...overrides,
  };
}

function deploymentDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...deployment(),
    tasks: [
      {
        id: "task-1",
        slug: "hello",
        name: "Hello",
        description: "Greets a user",
        executionConfig: {
          schemaVersion: 1,
          timeoutMs: 30_000,
          retry: {
            maxAttempts: 3,
            delayMs: 1_000,
            exponentialBackoff: true,
          },
          queue: {
            name: "default",
            concurrencyLimit: 2,
          },
        },
        createdAt: "2026-08-16T09:00:00.000Z",
        updatedAt: "2026-08-16T10:00:00.000Z",
        runsCount: 4,
        schedulesCount: 1,
      },
    ],
    ...overrides,
  };
}

describe("deployment read routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes deployment registration requests to the deployment service", async () => {
    createDeployment.mockResolvedValue(createDeploymentSuccess());

    const body = createDeploymentBody();
    const response = await httpRequest(createApp()).post("/api/deployments").send(body);

    expect(response.status).toBe(201);
    expect(createDeployment).toHaveBeenCalledWith({ auth: AUTH_CONTEXT, body });
    expect(response.body.deployment.id).toBe("deployment-1");
  });

  it("returns deployment version conflicts from the deployment service", async () => {
    createDeployment.mockResolvedValue(createDeploymentVersionExistsFailure());

    const response = await httpRequest(createApp())
      .post("/api/deployments")
      .send(createDeploymentBody({ version: "local-worker-test-001" }));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DEPLOYMENT_VERSION_EXISTS");
  });

  it("rejects deployment creation without DEPLOYMENTS_WRITE", async () => {
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

  it("lists deployments for a key with DEPLOYMENTS_WRITE", async () => {
    const deployments = [deploymentListItem()];

    listDeployments.mockResolvedValue({
      ok: true,
      status: 200,
      deployments,
    });

    const response = await httpRequest(createApp()).get("/api/deployments");

    expect(response.status).toBe(200);
    expect(listDeployments).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
    });
    expect(response.body).toEqual({
      deployments,
    });
  });

  it("rejects deployment listing without DEPLOYMENTS_WRITE", async () => {
    const response = await httpRequest(createApp({ scopes: [] })).get("/api/deployments");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(listDeployments).not.toHaveBeenCalled();
  });

  it("gets one deployment for a key with DEPLOYMENTS_WRITE", async () => {
    const result = deploymentDetail();

    getDeployment.mockResolvedValue({
      ok: true,
      status: 200,
      deployment: result,
    });

    const response = await httpRequest(createApp()).get(`/api/deployments/${DEPLOYMENT_ID}`);

    expect(response.status).toBe(200);
    expect(getDeployment).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      deploymentId: DEPLOYMENT_ID,
    });
    expect(response.body).toEqual({
      deployment: result,
    });
  });

  it("returns the deployment service's 404 response", async () => {
    getDeployment.mockResolvedValue({
      ok: false,
      status: 404,
      error: {
        code: "DEPLOYMENT_NOT_FOUND",
        message: "Deployment was not found in this environment",
      },
    });

    const response = await httpRequest(createApp()).get(`/api/deployments/${DEPLOYMENT_ID}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "DEPLOYMENT_NOT_FOUND",
        message: "Deployment was not found in this environment",
      },
    });
  });

  it("returns the deployment service's invalid-ID response", async () => {
    getDeployment.mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_DEPLOYMENT_ID",
        message: "deploymentId must be a valid UUID",
      },
    });

    const response = await httpRequest(createApp()).get("/api/deployments/not-a-uuid");

    expect(response.status).toBe(400);
    expect(getDeployment).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      deploymentId: "not-a-uuid",
    });
    expect(response.body).toEqual({
      error: {
        code: "INVALID_DEPLOYMENT_ID",
        message: "deploymentId must be a valid UUID",
      },
    });
  });

  it("rejects deployment detail without DEPLOYMENTS_WRITE", async () => {
    const response = await httpRequest(createApp({ scopes: [] })).get(
      `/api/deployments/${DEPLOYMENT_ID}`,
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(getDeployment).not.toHaveBeenCalled();
  });
});
