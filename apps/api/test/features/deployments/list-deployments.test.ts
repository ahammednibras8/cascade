import { ListDeploymentsResponseSchema } from "@cascade/api-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const ENVIRONMENT_ID = "environment-1";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-01-02T00:00:00.000Z");
const RUNTIME_STARTED_AT = new Date("2026-01-01T00:00:05.000Z");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  deployment: {
    count: vi.fn<(args: unknown) => Promise<number>>(),
    findMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { listDeployments } = await import("../../../src/features/deployments/list-deployments.js");

describe("listDeployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists deployments from the authenticated environment", async () => {
    prisma.deployment.count.mockResolvedValue(1);
    prisma.deployment.findMany.mockResolvedValue([
      {
        id: "deployment-1",
        environmentId: ENVIRONMENT_ID,
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        status: "ACTIVE",
        runtimeStatus: "RUNNING",
        runtimeError: null,
        runtimeStartedAt: RUNTIME_STARTED_AT,
        runtimeStoppedAt: null,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        _count: {
          tasks: 2,
          runs: 7,
        },
      },
    ]);

    const result = await listDeployments({ auth, query: {} });

    expect(() => ListDeploymentsResponseSchema.parse(result)).not.toThrow();
    expect(result).toEqual({
      ok: true,
      status: 200,
      deployments: [
        {
          id: "deployment-1",
          environmentId: ENVIRONMENT_ID,
          version: "v1",
          image: "ghcr.io/cascade/worker:v1",
          status: "ACTIVE",
          runtimeStatus: "RUNNING",
          runtimeError: null,
          runtimeStartedAt: RUNTIME_STARTED_AT.toISOString(),
          runtimeStoppedAt: null,
          createdAt: CREATED_AT.toISOString(),
          updatedAt: UPDATED_AT.toISOString(),
          tasksCount: 2,
          runsCount: 7,
        },
      ],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      },
    });

    expect(prisma.deployment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          environmentId: ENVIRONMENT_ID,
        },
      }),
    );
    expect(prisma.deployment.count).toHaveBeenCalledWith({
      where: {
        environmentId: ENVIRONMENT_ID,
      },
    });
  });

  it("returns an empty list when the environment has no deployments", async () => {
    prisma.deployment.count.mockResolvedValue(0);
    prisma.deployment.findMany.mockResolvedValue([]);

    const result = await listDeployments({ auth, query: {} });

    expect(() => ListDeploymentsResponseSchema.parse(result)).not.toThrow();
    expect(result).toEqual({
      ok: true,
      status: 200,
      deployments: [],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 0,
      },
    });
  });
});
