import { vi } from "vitest";
import type { ApiKeyScope } from "@cascade/database";
import { createRouteTestApp } from "../../support/route-test-app.js";

const databaseMock = vi.hoisted(() => ({
  ApiKeyScope: {
    DEPLOYMENTS_WRITE: "DEPLOYMENTS_WRITE",
  },
}));

const deploymentRouteMocks = vi.hoisted(() => ({
  createDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  deactivateDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  getDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
  listDeployments: vi.fn<(input: unknown) => Promise<unknown>>(),
  rollbackDeployment: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

export const {
  createDeployment,
  deactivateDeployment,
  getDeployment,
  listDeployments,
  rollbackDeployment,
} = deploymentRouteMocks;

vi.mock("@cascade/database", () => databaseMock);

vi.mock("../../../../src/features/deployments/create-deployment.js", () => ({
  createDeployment: deploymentRouteMocks.createDeployment,
}));

vi.mock("../../../../src/features/deployments/deactivate-deployment.js", () => ({
  deactivateDeployment: deploymentRouteMocks.deactivateDeployment,
}));

vi.mock("../../../../src/features/deployments/get-deployment.js", () => ({
  getDeployment: deploymentRouteMocks.getDeployment,
}));

vi.mock("../../../../src/features/deployments/list-deployments.js", () => ({
  listDeployments: deploymentRouteMocks.listDeployments,
}));

vi.mock("../../../../src/features/deployments/rollback-deployment.js", () => ({
  rollbackDeployment: deploymentRouteMocks.rollbackDeployment,
}));

const { deploymentRoutes } =
  await import("../../../../src/features/deployments/deployment-routes.js");

export function createApp(input: { scopes?: ApiKeyScope[] } = {}) {
  return createRouteTestApp(deploymentRoutes, input);
}
