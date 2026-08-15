import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_CONTEXT, createApp, deactivateDeployment } from "./tasks-router-harness.js";

const DEPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";

describe("deployment deactivation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deactivates a deployment", async () => {
    deactivateDeployment.mockResolvedValue({
      ok: true,
      status: 200,
      deployment: {
        id: DEPLOYMENT_ID,
        status: "INACTIVE",
        tasksDetached: 2,
        schedulesPaused: 3,
      },
    });

    const response = await httpRequest(createApp()).post(
      `/api/deployments/${DEPLOYMENT_ID}/deactivate`,
    );

    expect(response.status).toBe(200);
    expect(deactivateDeployment).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      deploymentId: DEPLOYMENT_ID,
    });
    expect(response.body).toEqual({
      deployment: {
        id: DEPLOYMENT_ID,
        status: "INACTIVE",
        tasksDetached: 2,
        schedulesPaused: 3,
      },
    });
  });

  it("returns a deactivation conflict from the service", async () => {
    deactivateDeployment.mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_ALREADY_INACTIVE",
        message: "Deployment is already inactive",
      },
    });

    const response = await httpRequest(createApp()).post(
      `/api/deployments/${DEPLOYMENT_ID}/deactivate`,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "DEPLOYMENT_ALREADY_INACTIVE",
        message: "Deployment is already inactive",
      },
    });
  });

  it("rejects deactivation without DEPLOYMENTS_WRITE", async () => {
    const response = await httpRequest(createApp({ scopes: [] })).post(
      `/api/deployments/${DEPLOYMENT_ID}/deactivate`,
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(deactivateDeployment).not.toHaveBeenCalled();
  });
});
