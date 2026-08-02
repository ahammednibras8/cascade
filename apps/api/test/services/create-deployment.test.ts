import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type TransactionClient = {
  deployment: {
    updateMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
    findUniqueOrThrow: (args: unknown) => Promise<unknown>;
  };
  task: {
    upsert: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn<(callback: TransactionCallback) => Promise<unknown>>(),
}));

const txDeploymentUpdateMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const txDeploymentCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const txDeploymentFindUniqueOrThrow = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<unknown>>(),
);

const txTaskUpsert = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { createDeployment } = await import("../../src/services/create-deployment.js");

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
  environmentId: "environment-1",
  projectId: "project-1",
} satisfies ApiAuthContext;

describe("createDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        deployment: {
          updateMany: txDeploymentUpdateMany,
          create: txDeploymentCreate,
          findUniqueOrThrow: txDeploymentFindUniqueOrThrow,
        },
        task: {
          upsert: txTaskUpsert,
        },
      }),
    );

    txDeploymentUpdateMany.mockResolvedValue({
      count: 1,
    });

    txDeploymentCreate.mockResolvedValue({
      id: "deployment-1",
    });

    txTaskUpsert.mockResolvedValue({});

    txDeploymentFindUniqueOrThrow.mockResolvedValue({
      id: "deployment-1",
      environmentId: "environment-1",
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      status: "ACTIVE",
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
        },
      ],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("creates an active deployment and attaches declared tasks to it", async () => {
    const result = await createDeployment({
      auth,
      body: {
        version: " v1 ",
        image: " ghcr.io/cascade/worker:v1 ",
        tasks: [
          {
            slug: " hello ",
            name: " Hello ",
            description: "Greets the user",
            executionConfig: EXECUTION_CONFIG,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected createDeployment to succeed");
    }

    expect(txDeploymentUpdateMany).toHaveBeenCalledWith({
      where: {
        environmentId: "environment-1",
        status: "ACTIVE",
      },
      data: {
        status: "INACTIVE",
      },
    });

    expect(txDeploymentCreate).toHaveBeenCalledWith({
      data: {
        environmentId: "environment-1",
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        status: "ACTIVE",
      },
    });

    expect(txTaskUpsert).toHaveBeenCalledWith({
      where: {
        environmentId_slug: {
          environmentId: "environment-1",
          slug: "hello",
        },
      },
      create: {
        environmentId: "environment-1",
        deploymentId: "deployment-1",
        slug: "hello",
        name: "Hello",
        description: "Greets the user",
        executionConfig: EXECUTION_CONFIG,
      },
      update: {
        deploymentId: "deployment-1",
        name: "Hello",
        description: "Greets the user",
        executionConfig: EXECUTION_CONFIG,
      },
    });

    expect(txDeploymentFindUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        id: "deployment-1",
      },
      include: {
        tasks: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
          orderBy: {
            slug: "asc",
          },
        },
      },
    });

    expect(result.status).toBe(201);
    expect(result.deployment).toEqual({
      id: "deployment-1",
      environmentId: "environment-1",
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      status: "ACTIVE",
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("rejects invalid deployment bodies before opening a transaction", async () => {
    const result = await createDeployment({
      auth,
      body: {
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        tasks: [],
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_TASKS",
        message: "tasks must be a non-empty array",
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects deployment tasks without complete execution config", async () => {
    const result = await createDeployment({
      auth,
      body: {
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        tasks: [
          {
            slug: "hello",
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_TASK_EXECUTION_CONFIG",
        message:
          "task.executionConfig must contain schemaVersion, timeoutMs, retry, and queue settings",
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when the deployment version already exists in the environment", async () => {
    prisma.$transaction.mockRejectedValueOnce({
      code: "P2002",
      meta: {
        target: ["environmentId", "version"],
      },
    });

    await expect(
      createDeployment({
        auth,
        body: {
          version: "v1",
          image: "ghcr.io/cascade/worker:v1",
          tasks: [
            {
              slug: "hello",
              executionConfig: EXECUTION_CONFIG,
            },
          ],
        },
      }),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_VERSION_EXISTS",
        message: "A deployment with this version already exists in the environment",
      },
    });
  });
});
