import { describe, expect, it } from "vitest";
import {
  DeactivateDeploymentResponseSchema,
  DeploymentDetailResponseSchema,
  ListDeploymentsResponseSchema,
  RollbackDeploymentResponseSchema,
  apiContracts,
} from "../src/index.js";

describe("deployment API contracts", () => {
  it("declares deployment list, detail, and mutation endpoints", () => {
    expect(apiContracts.listDeployments).toMatchObject({
      method: "GET",
      path: "/api/deployments",
      kind: "list",
      retrySafety: "safe",
      pagination: "required",
    });
    expect(apiContracts.getDeployment).toMatchObject({
      method: "GET",
      path: "/api/deployments/:deploymentId",
      kind: "detail",
      retrySafety: "safe",
    });
    expect(apiContracts.deactivateDeployment).toMatchObject({
      method: "POST",
      path: "/api/deployments/:deploymentId/deactivate",
      kind: "mutation",
      retrySafety: "unsafe",
    });
    expect(apiContracts.rollbackDeployment).toMatchObject({
      method: "POST",
      path: "/api/deployments/:deploymentId/rollback",
      kind: "mutation",
      retrySafety: "unsafe",
    });
  });

  it("parses deployment list, detail, deactivate, and rollback responses", () => {
    expect(() =>
      ListDeploymentsResponseSchema.parse(createListDeploymentsResponse()),
    ).not.toThrow();
    expect(() =>
      DeploymentDetailResponseSchema.parse(createDeploymentDetailResponse()),
    ).not.toThrow();
    expect(() =>
      DeactivateDeploymentResponseSchema.parse(createDeactivateDeploymentResponse()),
    ).not.toThrow();
    expect(() =>
      RollbackDeploymentResponseSchema.parse(createRollbackDeploymentResponse()),
    ).not.toThrow();
  });
});

function createDeploymentBase() {
  return {
    id: "deployment-1",
    environmentId: "environment-1",
    version: "v1",
    image: "ghcr.io/cascade/worker:v1",
    status: "ACTIVE",
    runtimeStatus: "RUNNING",
    runtimeError: null,
    runtimeStartedAt: "2026-01-01T00:00:05.000Z",
    runtimeStoppedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:05.000Z",
  };
}

function createDeploymentListItem() {
  return {
    ...createDeploymentBase(),
    tasksCount: 2,
    runsCount: 7,
  };
}

function createListDeploymentsResponse() {
  return {
    deployments: [createDeploymentListItem()],
    pagination: {
      limit: 50,
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    },
  };
}

function createDeploymentDetailResponse() {
  return {
    deployment: {
      ...createDeploymentBase(),
      runsCount: 7,
      canRollback: true,
      manifestTasks: [
        {
          id: "manifest-task-1",
          slug: "hello",
          name: "Hello",
          description: "Greets a user",
          executionConfig: createExecutionConfig(),
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          description: "Greets a user",
          executionConfig: createExecutionConfig(),
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:05.000Z",
          runsCount: 3,
          schedulesCount: 2,
        },
      ],
    },
  };
}

function createExecutionConfig() {
  return {
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
  };
}

function createDeactivateDeploymentResponse() {
  return {
    deployment: {
      id: "deployment-1",
      status: "INACTIVE",
      tasksDetached: 2,
      schedulesPaused: 1,
    },
  };
}

function createRollbackDeploymentResponse() {
  return {
    deployment: {
      id: "deployment-1",
      status: "ACTIVE",
      tasksRestored: 2,
      tasksDetached: 1,
      schedulesUpdated: 2,
      schedulesPaused: 1,
    },
  };
}
