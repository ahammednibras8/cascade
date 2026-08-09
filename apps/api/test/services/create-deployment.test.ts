import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type TransactionClient = {
  deployment: {
    updateMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
    findUniqueOrThrow: (args: unknown) => Promise<unknown>;
  };
  task: { upsert: (args: unknown) => Promise<{ id: string }> };
  taskSchedule: { updateMany: (args: unknown) => Promise<unknown> };
};

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction:
      vi.fn<(callback: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>>(),
  },
  deploymentUpdateMany: vi.fn<(args: unknown) => Promise<unknown>>(),
  deploymentCreate: vi.fn<(args: unknown) => Promise<{ id: string }>>(),
  deploymentFindUniqueOrThrow: vi.fn<(args: unknown) => Promise<unknown>>(),
  taskUpsert: vi.fn<(args: unknown) => Promise<{ id: string }>>(),
  taskScheduleUpdateMany: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

vi.mock("@cascade/database", () => ({ prisma: mocks.prisma }));

const { createDeployment } = await import("../../src/services/create-deployment.js");

const ENVIRONMENT_ID = "environment-1";
const IMAGE = "ghcr.io/cascade/worker:v1";
const EXECUTION_CONFIG = {
  schemaVersion: 1,
  timeoutMs: 30_000,
  retry: { maxAttempts: 3, delayMs: 1000, exponentialBackoff: true },
  queue: { name: "hello", concurrencyLimit: 2 },
};

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

function task(overrides: Record<string, unknown> = {}) {
  return { slug: "hello", executionConfig: EXECUTION_CONFIG, ...overrides };
}

function body(overrides: Record<string, unknown> = {}) {
  return { version: "v1", image: IMAGE, tasks: [task()], ...overrides };
}

function createDeploymentWithBody(deploymentBody: unknown) {
  return createDeployment({ auth, body: deploymentBody });
}

function expectNoTransaction() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
}

describe("createDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        deployment: {
          updateMany: mocks.deploymentUpdateMany,
          create: mocks.deploymentCreate,
          findUniqueOrThrow: mocks.deploymentFindUniqueOrThrow,
        },
        task: { upsert: mocks.taskUpsert },
        taskSchedule: { updateMany: mocks.taskScheduleUpdateMany },
      }),
    );
    mocks.deploymentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deploymentCreate.mockResolvedValue({ id: "deployment-1" });
    mocks.taskUpsert.mockResolvedValue({ id: "task-1" });
    mocks.taskScheduleUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deploymentFindUniqueOrThrow.mockResolvedValue({
      id: "deployment-1",
      environmentId: ENVIRONMENT_ID,
      version: "v1",
      image: IMAGE,
      status: "ACTIVE",
      tasks: [{ id: "task-1", slug: "hello", name: "Hello" }],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("creates an active deployment, attaches tasks, and bumps schedule revisions", async () => {
    const result = await createDeploymentWithBody(
      body({
        version: " v1 ",
        image: ` ${IMAGE} `,
        tasks: [task({ slug: " hello ", name: " Hello ", description: "Greets the user" })],
      }),
    );

    expect(mocks.deploymentUpdateMany).toHaveBeenCalledWith({
      where: { environmentId: ENVIRONMENT_ID, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
    expect(mocks.deploymentCreate).toHaveBeenCalledWith({
      data: { environmentId: ENVIRONMENT_ID, version: "v1", image: IMAGE, status: "ACTIVE" },
    });
    expect(mocks.taskUpsert).toHaveBeenCalledWith({
      where: { environmentId_slug: { environmentId: ENVIRONMENT_ID, slug: "hello" } },
      create: {
        environmentId: ENVIRONMENT_ID,
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
      select: { id: true },
    });
    expect(mocks.taskScheduleUpdateMany).toHaveBeenCalledWith({
      where: { taskId: { in: ["task-1"] } },
      data: { revision: { increment: 1 }, lockedAt: null },
    });
    expect(mocks.deploymentFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "deployment-1" },
      include: {
        tasks: {
          select: { id: true, slug: true, name: true },
          orderBy: { slug: "asc" },
        },
      },
    });
    expect(result).toEqual({
      ok: true,
      status: 201,
      deployment: {
        id: "deployment-1",
        environmentId: ENVIRONMENT_ID,
        version: "v1",
        image: IMAGE,
        status: "ACTIVE",
        tasks: [{ id: "task-1", slug: "hello", name: "Hello" }],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  it.each([
    [
      "empty task list",
      body({ tasks: [] }),
      { code: "INVALID_TASKS", message: "tasks must be a non-empty array" },
    ],
    [
      "task without complete execution config",
      body({ tasks: [{ slug: "hello" }] }),
      {
        code: "INVALID_TASK_EXECUTION_CONFIG",
        message:
          "task.executionConfig must contain schemaVersion, timeoutMs, retry, and queue settings",
      },
    ],
    [
      "more than 100 tasks",
      body({ tasks: Array.from({ length: 101 }, (_, index) => task({ slug: `task-${index}` })) }),
      { code: "INVALID_TASKS", message: "tasks must contain at most 100 items" },
    ],
    [
      "duplicate task slugs",
      body({ tasks: [task(), task()] }),
      { code: "DUPLICATE_TASK_SLUG", message: "tasks must not contain duplicate task.slug values" },
    ],
    [
      "oversized deployment version",
      body({ version: "v".repeat(121) }),
      {
        code: "INVALID_VERSION",
        message: "version must be a non-empty string with at most 120 characters",
      },
    ],
    [
      "blank task name",
      body({ tasks: [task({ name: " " })] }),
      {
        code: "INVALID_TASK_NAME",
        message: "task.name must be a non-empty string with at most 200 characters",
      },
    ],
  ])("rejects %s before opening a transaction", async (_name, invalidBody, error) => {
    await expect(createDeploymentWithBody(invalidBody)).resolves.toEqual({
      ok: false,
      status: 400,
      error,
    });
    expectNoTransaction();
  });

  it("returns 409 when the deployment version already exists in the environment", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce({
      code: "P2002",
      meta: { target: ["environmentId", "version"] },
    });

    await expect(createDeploymentWithBody(body())).resolves.toEqual({
      ok: false,
      status: 409,
      error: {
        code: "DEPLOYMENT_VERSION_EXISTS",
        message: "A deployment with this version already exists in the environment",
      },
    });
  });
});
