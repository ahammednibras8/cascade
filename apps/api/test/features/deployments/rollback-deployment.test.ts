import { RollbackDeploymentResponseSchema } from "@cascade/api-contracts";
import { beforeEach, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

type TransactionClient = {
  deployment: {
    updateMany: (input: unknown) => Promise<{ count: number }>;
  };
  task: {
    updateMany: (input: unknown) => Promise<{ count: number }>;
    upsert: (input: unknown) => Promise<{ id: string }>;
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
  taskUpsert: vi.fn<(input: unknown) => Promise<{ id: string }>>(),
  taskScheduleUpdateMany: vi.fn<(input: unknown) => Promise<{ count: number }>>(),
}));

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: mocks.dbNull,
  },
  prisma: mocks.prisma,
}));

const { rollbackDeployment } =
  await import("../../../src/features/deployments/rollback-deployment.js");

const DEPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";
const ENVIRONMENT_ID = "environment-1";
const TASK_ID = "task-hello";

const EXECUTION_CONFIG = {
  schemaVersion: 1,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 3,
    delayMs: 1_000,
    exponentialBackoff: true,
  },
  queue: {
    name: "hello",
    concurrencyLimit: 2,
  },
};

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const manifestTask = {
  slug: "hello",
  name: "Hello",
  description: "Greets a user",
  executionConfig: EXECUTION_CONFIG,
};

const omittedTaskWhere = {
  environmentId: ENVIRONMENT_ID,
  deploymentId: {
    not: null,
  },
  slug: {
    notIn: ["hello"],
  },
};

function inactiveDeployment(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPLOYMENT_ID,
    status: "INACTIVE",
    manifestTasks: [manifestTask],
    ...overrides,
  };
}

function rollback(deploymentId = DEPLOYMENT_ID) {
  return rollbackDeployment({
    auth,
    deploymentId,
  });
}

function expectNoTransaction() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
}

function failure(status: 400 | 404 | 409, code: string, message: string) {
  return {
    ok: false,
    status,
    error: { code, message },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.$transaction.mockImplementation(async (callback) =>
    callback({
      deployment: {
        updateMany: mocks.deploymentUpdateMany,
      },
      task: {
        updateMany: mocks.taskUpdateMany,
        upsert: mocks.taskUpsert,
      },
      taskSchedule: {
        updateMany: mocks.taskScheduleUpdateMany,
      },
    }),
  );

  mocks.deploymentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.taskUpdateMany.mockResolvedValue({ count: 2 });
  mocks.taskUpsert.mockResolvedValue({ id: TASK_ID });
  mocks.taskScheduleUpdateMany.mockResolvedValue({ count: 3 });
});

it("activates the target deployment and restores its immutable task manifest", async () => {
  mocks.prisma.deployment.findFirst.mockResolvedValue(inactiveDeployment());

  const result = await rollback();

  expect(() => RollbackDeploymentResponseSchema.parse(result)).not.toThrow();
  expect(result).toEqual({
    ok: true,
    status: 200,
    deployment: {
      id: DEPLOYMENT_ID,
      status: "ACTIVE",
      tasksRestored: 1,
      tasksDetached: 2,
      schedulesUpdated: 3,
      schedulesPaused: 3,
    },
  });

  expect(mocks.prisma.deployment.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: DEPLOYMENT_ID,
        environmentId: ENVIRONMENT_ID,
      },
    }),
  );

  expect(mocks.deploymentUpdateMany).toHaveBeenNthCalledWith(1, {
    where: {
      id: DEPLOYMENT_ID,
      environmentId: ENVIRONMENT_ID,
      status: "INACTIVE",
    },
    data: {
      status: "ACTIVE",
      runtimeStatus: "PENDING",
      runtimeContainerId: null,
      runtimeError: null,
      runtimeStartedAt: null,
      runtimeStoppedAt: null,
    },
  });
  expect(mocks.deploymentUpdateMany).toHaveBeenNthCalledWith(2, {
    where: {
      environmentId: ENVIRONMENT_ID,
      id: {
        not: DEPLOYMENT_ID,
      },
      status: "ACTIVE",
    },
    data: {
      status: "INACTIVE",
    },
  });

  expect(mocks.taskScheduleUpdateMany).toHaveBeenNthCalledWith(1, {
    where: {
      enabled: true,
      task: omittedTaskWhere,
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
    where: omittedTaskWhere,
    data: {
      deploymentId: null,
      executionConfig: mocks.dbNull,
    },
  });
  expect(mocks.taskUpsert).toHaveBeenCalledWith({
    where: {
      environmentId_slug: {
        environmentId: ENVIRONMENT_ID,
        slug: "hello",
      },
    },
    create: {
      environmentId: ENVIRONMENT_ID,
      deploymentId: DEPLOYMENT_ID,
      ...manifestTask,
    },
    update: {
      deploymentId: DEPLOYMENT_ID,
      name: "Hello",
      description: "Greets a user",
      executionConfig: EXECUTION_CONFIG,
    },
    select: {
      id: true,
    },
  });
  expect(mocks.taskScheduleUpdateMany).toHaveBeenNthCalledWith(2, {
    where: {
      taskId: {
        in: [TASK_ID],
      },
    },
    data: {
      lockedAt: null,
      revision: {
        increment: 1,
      },
    },
  });
});

it("rejects an invalid deployment ID before querying the database", async () => {
  await expect(rollback("not-a-uuid")).resolves.toEqual(
    failure(400, "INVALID_DEPLOYMENT_ID", "deploymentId must be a valid UUID"),
  );

  expect(mocks.prisma.deployment.findFirst).not.toHaveBeenCalled();
  expectNoTransaction();
});

it.each([
  {
    name: "deployment outside the authenticated environment",
    deployment: null,
    expected: failure(404, "DEPLOYMENT_NOT_FOUND", "Deployment was not found in this environment"),
  },
  {
    name: "already active deployment",
    deployment: inactiveDeployment({ status: "ACTIVE" }),
    expected: failure(409, "DEPLOYMENT_ALREADY_ACTIVE", "Deployment is already active"),
  },
  {
    name: "legacy deployment without an immutable manifest",
    deployment: inactiveDeployment({ manifestTasks: [] }),
    expected: failure(
      409,
      "DEPLOYMENT_MANIFEST_MISSING",
      "This deployment was created before task manifests were stored and cannot be rolled back",
    ),
  },
])("rejects $name", async ({ deployment, expected }) => {
  mocks.prisma.deployment.findFirst.mockResolvedValue(deployment);

  await expect(rollback()).resolves.toEqual(expected);
  expectNoTransaction();
});

it("returns a conflict when another request changes target deployment state first", async () => {
  mocks.prisma.deployment.findFirst.mockResolvedValue(inactiveDeployment());
  mocks.deploymentUpdateMany.mockResolvedValueOnce({ count: 0 });

  await expect(rollback()).resolves.toEqual(
    failure(
      409,
      "DEPLOYMENT_STATE_CHANGED",
      "Deployment state changed before it could be rolled back",
    ),
  );
});
