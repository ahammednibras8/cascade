import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, rollbackDeployment } from "./support/deployment-route-harness.js";
import { AUTH_CONTEXT } from "../support/route-test-app.js";

const DEPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";

describe("deployment rollback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rolls back a deployment", async () => {
    rollbackDeployment.mockResolvedValue({
      ok: true,
      status: 200,
      deployment: {
        id: DEPLOYMENT_ID,
        status: "ACTIVE",
        tasksRestored: 2,
        tasksDetached: 1,
        schedulesUpdated: 2,
        schedulesPaused: 1,
      },
    });

    const response = await httpRequest(createApp()).post(
      `/api/deployments/${DEPLOYMENT_ID}/rollback`,
    );

    expect(response.status).toBe(200);
    expect(rollbackDeployment).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      deploymentId: DEPLOYMENT_ID,
    });
    expect(response.body).toEqual({
      deployment: {
        id: DEPLOYMENT_ID,
        status: "ACTIVE",
        tasksRestored: 2,
        tasksDetached: 1,
        schedulesUpdated: 2,
        schedulesPaused: 1,
      },
    });
  });

  it("returns rollback conflicts from the service", async () => {
    rollbackDeployment.mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_MANIFEST_MISSING",
        message:
          "This deployment was created before task manifests were stored and cannot be rolled back",
      },
    });

    const response = await httpRequest(createApp()).post(
      `/api/deployments/${DEPLOYMENT_ID}/rollback`,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "DEPLOYMENT_MANIFEST_MISSING",
        message:
          "This deployment was created before task manifests were stored and cannot be rolled back",
      },
    });
  });

  it("rejects rollback without DEPLOYMENTS_WRITE", async () => {
    const response = await httpRequest(createApp({ scopes: [] })).post(
      `/api/deployments/${DEPLOYMENT_ID}/rollback`,
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(rollbackDeployment).not.toHaveBeenCalled();
  });
});
