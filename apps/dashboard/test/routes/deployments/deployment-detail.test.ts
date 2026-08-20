import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

const requireDashboardCapability = vi.hoisted(() =>
  vi.fn<(request: Request, capability: string) => Promise<unknown>>(),
);

vi.mock("~/lib/api/cascade-api.server", () => ({
  cascadeDashboardApiRequest,
}));

vi.mock("../../../app/lib/auth/dashboard-permissions.server.js", () => ({
  requireDashboardCapability,
}));

const { action, loader } = await import("../../../app/routes/deployments/deployment-detail.js");

const DEPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPLOYMENT_ID,
    environmentId: "environment-1",
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
    canRollback: false,
    manifestTasks: [],
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

function routeArgs(deploymentId = DEPLOYMENT_ID) {
  return {
    params: {
      deploymentId,
    },
    request: new Request(`http://dashboard.test/deployments/${deploymentId}`),
  } as never;
}

function actionArgs(intent: string, deploymentId = DEPLOYMENT_ID) {
  return {
    params: {
      deploymentId,
    },
    request: new Request(`http://dashboard.test/deployments/${deploymentId}`, {
      method: "POST",
      body: new URLSearchParams({
        intent,
      }),
    }),
  } as never;
}

describe("deployment detail loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDashboardCapability.mockResolvedValue({});
  });

  it("returns a deployment from the Cascade API", async () => {
    const result = deployment();

    cascadeDashboardApiRequest.mockResolvedValue({
      deployment: result,
    });

    await expect(loader(routeArgs())).resolves.toEqual({
      deployment: result,
      deploymentId: DEPLOYMENT_ID,
    });

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/deployments/${DEPLOYMENT_ID}`,
    );
  });

  it("URL-encodes the deployment ID before requesting the API", async () => {
    const deploymentId = "deployment/with spaces";

    cascadeDashboardApiRequest.mockResolvedValue({
      deployment: deployment({
        id: deploymentId,
      }),
    });

    await loader(routeArgs(deploymentId));

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/deployments/deployment%2Fwith%20spaces",
    );
  });

  it("returns null when the deployment does not exist", async () => {
    cascadeDashboardApiRequest.mockRejectedValue({
      status: 404,
      responseBody: {
        error: {
          code: "DEPLOYMENT_NOT_FOUND",
        },
      },
    });

    await expect(loader(routeArgs())).resolves.toEqual({
      deployment: null,
      deploymentId: DEPLOYMENT_ID,
    });
  });

  it("rethrows API failures other than DEPLOYMENT_NOT_FOUND", async () => {
    const error = {
      status: 500,
      responseBody: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
        },
      },
    };

    cascadeDashboardApiRequest.mockRejectedValue(error);

    await expect(loader(routeArgs())).rejects.toBe(error);
  });

  it("sends a deployment deactivation request to the API", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      deployment: {
        id: DEPLOYMENT_ID,
        status: "INACTIVE",
        tasksDetached: 2,
        schedulesPaused: 1,
      },
    });

    await expect(action(actionArgs("deactivate"))).resolves.toEqual({
      ok: true,
      intent: "deactivate",
      deployment: {
        id: DEPLOYMENT_ID,
        status: "INACTIVE",
        tasksDetached: 2,
        schedulesPaused: 1,
      },
    });

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/deployments/${DEPLOYMENT_ID}/deactivate`,
      {
        method: "POST",
      },
    );
    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "DEPLOYMENTS_MANAGE",
    );
  });

  it("rejects an invalid deployment action before calling the API", async () => {
    await expect(action(actionArgs("delete"))).rejects.toMatchObject({
      status: 400,
    });

    expect(cascadeDashboardApiRequest).not.toHaveBeenCalled();
    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "DEPLOYMENTS_MANAGE",
    );
  });

  it("returns the API failure status when deactivation fails", async () => {
    cascadeDashboardApiRequest.mockRejectedValue({
      status: 409,
      responseBody: {
        error: {
          code: "DEPLOYMENT_ALREADY_INACTIVE",
        },
      },
    });

    await expect(action(actionArgs("deactivate"))).rejects.toMatchObject({
      status: 409,
    });
    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "DEPLOYMENTS_MANAGE",
    );
  });

  it("sends a deployment rollback request to the API", async () => {
    cascadeDashboardApiRequest.mockResolvedValue({
      deployment: {
        id: DEPLOYMENT_ID,
        status: "ACTIVE",
        tasksRestored: 2,
        tasksDetached: 1,
        schedulesUpdated: 2,
        schedulesPaused: 1,
      },
    });

    await expect(action(actionArgs("rollback"))).resolves.toEqual({
      ok: true,
      intent: "rollback",
      deployment: {
        id: DEPLOYMENT_ID,
        status: "ACTIVE",
        tasksRestored: 2,
        tasksDetached: 1,
        schedulesUpdated: 2,
        schedulesPaused: 1,
      },
    });

    expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      `/api/deployments/${DEPLOYMENT_ID}/rollback`,
      {
        method: "POST",
      },
    );
    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "DEPLOYMENTS_MANAGE",
    );
  });

  it("does not call the API when deployment management permission is denied", async () => {
    requireDashboardCapability.mockRejectedValueOnce(
      new Response("Forbidden", {
        status: 403,
      }),
    );

    await expect(action(actionArgs("deactivate"))).rejects.toMatchObject({
      status: 403,
    });

    expect(requireDashboardCapability).toHaveBeenCalledWith(
      expect.any(Request),
      "DEPLOYMENTS_MANAGE",
    );
    expect(cascadeDashboardApiRequest).not.toHaveBeenCalled();
  });
});
