import { DeploymentDetailResponseSchema } from "@cascade/api-contracts";
import { beforeEach, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const DEPLOYMENT_ID = "22222222-2222-4222-8222-222222222222";
const ENVIRONMENT_ID = "environment-1";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-01-02T00:00:00.000Z");
const RUNTIME_STARTED_AT = new Date("2026-01-01T00:00:05.000Z");
const RUNTIME_STOPPED_AT = new Date("2026-01-01T00:10:05.000Z");

const EXECUTION_CONFIG = {
  schemaVersion: 1,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
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

const prisma = vi.hoisted(() => ({
  deployment: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { getDeployment } = await import("../../../src/features/deployments/get-deployment.js");

beforeEach(() => {
  vi.clearAllMocks();
});

it("returns a deployment, its current tasks, and its saved manifest", async () => {
  prisma.deployment.findFirst.mockResolvedValue({
    id: DEPLOYMENT_ID,
    environmentId: ENVIRONMENT_ID,
    version: "v1",
    image: "ghcr.io/cascade/worker:v1",
    status: "INACTIVE",
    runtimeStatus: "STOPPED",
    runtimeError: "worker stopped",
    runtimeStartedAt: RUNTIME_STARTED_AT,
    runtimeStoppedAt: RUNTIME_STOPPED_AT,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    _count: {
      runs: 5,
      manifestTasks: 1,
    },
    manifestTasks: [
      {
        id: "manifest-task-1",
        slug: "hello",
        name: "Hello",
        description: "Greets a user",
        executionConfig: EXECUTION_CONFIG,
        createdAt: CREATED_AT,
      },
    ],
    tasks: [
      {
        id: "task-1",
        slug: "hello",
        name: "Hello",
        description: "Greets a user",
        executionConfig: EXECUTION_CONFIG,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        _count: {
          runs: 3,
          schedules: 2,
        },
      },
    ],
  });

  const result = await getDeployment({
    auth,
    deploymentId: DEPLOYMENT_ID,
  });

  expect(() => DeploymentDetailResponseSchema.parse(result)).not.toThrow();
  expect(result).toEqual({
    ok: true,
    status: 200,
    deployment: {
      id: DEPLOYMENT_ID,
      environmentId: ENVIRONMENT_ID,
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      status: "INACTIVE",
      runtimeStatus: "STOPPED",
      runtimeError: "worker stopped",
      runtimeStartedAt: RUNTIME_STARTED_AT.toISOString(),
      runtimeStoppedAt: RUNTIME_STOPPED_AT.toISOString(),
      createdAt: CREATED_AT.toISOString(),
      updatedAt: UPDATED_AT.toISOString(),
      runsCount: 5,
      canRollback: true,
      manifestTasks: [
        {
          id: "manifest-task-1",
          slug: "hello",
          name: "Hello",
          description: "Greets a user",
          executionConfig: EXECUTION_CONFIG,
          createdAt: CREATED_AT.toISOString(),
        },
      ],
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          description: "Greets a user",
          executionConfig: EXECUTION_CONFIG,
          createdAt: CREATED_AT.toISOString(),
          updatedAt: UPDATED_AT.toISOString(),
          runsCount: 3,
          schedulesCount: 2,
        },
      ],
    },
  });

  expect(prisma.deployment.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: DEPLOYMENT_ID,
        environmentId: ENVIRONMENT_ID,
      },
    }),
  );
});

it("does not offer rollback for an inactive deployment without a saved manifest", async () => {
  prisma.deployment.findFirst.mockResolvedValue({
    id: DEPLOYMENT_ID,
    environmentId: ENVIRONMENT_ID,
    version: "v1",
    image: "ghcr.io/cascade/worker:v1",
    status: "INACTIVE",
    runtimeStatus: "STOPPED",
    runtimeError: null,
    runtimeStartedAt: null,
    runtimeStoppedAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    _count: {
      runs: 0,
      manifestTasks: 0,
    },
    manifestTasks: [],
    tasks: [],
  });

  const result = await getDeployment({
    auth,
    deploymentId: DEPLOYMENT_ID,
  });

  expect(() => DeploymentDetailResponseSchema.parse(result)).not.toThrow();
  expect(result).toMatchObject({
    ok: true,
    status: 200,
    deployment: {
      id: DEPLOYMENT_ID,
      canRollback: false,
      manifestTasks: [],
    },
  });
});

it("does not expose deployments from another environment", async () => {
  prisma.deployment.findFirst.mockResolvedValue(null);

  await expect(getDeployment({ auth, deploymentId: DEPLOYMENT_ID })).resolves.toEqual({
    ok: false,
    status: 404,
    error: {
      code: "DEPLOYMENT_NOT_FOUND",
      message: "Deployment was not found in this environment",
    },
  });
});

it("rejects invalid deployment IDs before querying the database", async () => {
  await expect(getDeployment({ auth, deploymentId: "not-a-uuid" })).resolves.toEqual({
    ok: false,
    status: 400,
    error: {
      code: "INVALID_DEPLOYMENT_ID",
      message: "deploymentId must be a valid UUID",
    },
  });

  expect(prisma.deployment.findFirst).not.toHaveBeenCalled();
});
