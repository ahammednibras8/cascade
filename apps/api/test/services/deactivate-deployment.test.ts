import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type TransactionClient = {
  deployment: {
    updateMany: (input: unknown) => Promise<{ count: number }>;
  };
  task: {
    updateMany: (input: unknown) => Promise<{ count: number }>;
  };
  taskSchedule: {
    updateMany: (input: unknown) => Promise<{ count: number }>;
  };
};

const mocks = vi.hoisted(() => ({
  dbNull: Symbol("DbNull"),
  prisma: {
    deployment: {
      findFirst: vi.fn<(input: unknown) => Promise<unknown>>(),
    },
    $transaction:
      vi.fn<(callback: (transaction: TransactionClient) => Promise<unknown>) => Promise<unknown>>(),
  },
  deploymentUpdateMany: vi.fn<(input: unknown) => Promise<{ count: number }>>(),
  taskUpdateMany: vi.fn<(input: unknown) => Promise<{ count: number }>>(),
  taskScheduleUpdateMany: vi.fn<(input: unknown) => Promise<{ count: number }>>(),
}));

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: mocks.dbNull,
  },
  prisma: mocks.prisma,
}));

const { deactivateDeployment } = await import("../../src/services/deactivate-deployment.js");

const DEPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";
const ENVIRONMENT_ID = "environment-1";

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

function activeDeployment() {
  return {
    id: DEPLOYMENT_ID,
    status: "ACTIVE",
  };
}

describe("deactivateDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        deployment: {
          updateMany: mocks.deploymentUpdateMany,
        },
        task: {
          updateMany: mocks.taskUpdateMany,
        },
        taskSchedule: {
          updateMany: mocks.taskScheduleUpdateMany,
        },
      }),
    );

    mocks.deploymentUpdateMany.mockResolvedValue({
      count: 1,
    });
    mocks.taskUpdateMany.mockResolvedValue({
      count: 2,
    });
    mocks.taskScheduleUpdateMany.mockResolvedValue({
      count: 3,
    });
  });

  it("deactivates an active deployment, pauses schedules, and detaches tasks", async () => {
    mocks.prisma.deployment.findFirst.mockResolvedValue(activeDeployment());

    await expect(
      deactivateDeployment({
        auth,
        deploymentId: DEPLOYMENT_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      deployment: {
        id: DEPLOYMENT_ID,
        status: "INACTIVE",
        tasksDetached: 2,
        schedulesPaused: 3,
      },
    });

    expect(mocks.prisma.deployment.findFirst).toHaveBeenCalledWith({
      where: {
        id: DEPLOYMENT_ID,
        environmentId: ENVIRONMENT_ID,
      },
      select: {
        id: true,
        status: true,
      },
    });

    expect(mocks.deploymentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: DEPLOYMENT_ID,
        environmentId: ENVIRONMENT_ID,
        status: "ACTIVE",
      },
      data: {
        status: "INACTIVE",
      },
    });

    expect(mocks.taskScheduleUpdateMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        task: {
          environmentId: ENVIRONMENT_ID,
          deploymentId: DEPLOYMENT_ID,
        },
      },
      data: {
        enabled: false,
        lockedAt: null,
        revision: {
          increment: 1,
        },
      },
    });

    expect(mocks.taskUpdateMany).toHaveBeenCalledWith({
      where: {
        environmentId: ENVIRONMENT_ID,
        deploymentId: DEPLOYMENT_ID,
      },
      data: {
        deploymentId: null,
        executionConfig: mocks.dbNull,
      },
    });
  });

  it("rejects an invalid deployment ID before querying the database", async () => {
    await expect(
      deactivateDeployment({
        auth,
        deploymentId: "not-a-uuid",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_DEPLOYMENT_ID",
        message: "deploymentId must be a valid UUID",
      },
    });

    expect(mocks.prisma.deployment.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the deployment is outside the authenticated environment", async () => {
    mocks.prisma.deployment.findFirst.mockResolvedValue(null);

    await expect(
      deactivateDeployment({
        auth,
        deploymentId: DEPLOYMENT_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: {
        code: "DEPLOYMENT_NOT_FOUND",
        message: "Deployment was not found in this environment",
      },
    });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an already inactive deployment", async () => {
    mocks.prisma.deployment.findFirst.mockResolvedValue({
      id: DEPLOYMENT_ID,
      status: "INACTIVE",
    });

    await expect(
      deactivateDeployment({
        auth,
        deploymentId: DEPLOYMENT_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_ALREADY_INACTIVE",
        message: "Deployment is already inactive",
      },
    });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns a conflict when another request changes deployment state first", async () => {
    mocks.prisma.deployment.findFirst.mockResolvedValue(activeDeployment());
    mocks.deploymentUpdateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      deactivateDeployment({
        auth,
        deploymentId: DEPLOYMENT_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_STATE_CHANGED",
        message: "Deployment state changed before it could be deactivated",
      },
    });
  });
});
