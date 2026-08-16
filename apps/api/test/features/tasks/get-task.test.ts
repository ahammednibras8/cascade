import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ENVIRONMENT_ID = "environment-1";
const CREATED_AT = new Date("2026-08-16T09:00:00.000Z");
const UPDATED_AT = new Date("2026-08-16T10:00:00.000Z");

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

const dbNull = vi.hoisted(() => Symbol("DbNull"));

const prisma = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: dbNull,
  },
  prisma,
}));

const { getTask } = await import("../../../src/features/tasks/get-task.js");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

describe("getTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns task configuration, deployment, schedules, and recent runs", async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: TASK_ID,
      slug: "hello",
      name: "Hello",
      description: "Greets a user",
      executionConfig: EXECUTION_CONFIG,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      deployment: {
        id: "deployment-1",
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        status: "ACTIVE",
        runtimeStatus: "RUNNING",
      },
      _count: {
        runs: 4,
        schedules: 2,
      },
      schedules: [
        {
          id: "schedule-1",
          name: "Every hour",
          scheduleType: "INTERVAL",
          intervalSeconds: 3_600,
          cronExpression: null,
          timezone: "UTC",
          nextRunAt: CREATED_AT,
          lastRunAt: null,
          enabled: true,
          payload: {
            source: "test",
          },
          revision: 1,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        },
      ],
      runs: [
        {
          id: "run-1",
          status: "COMPLETED",
          deploymentId: "deployment-1",
          scheduleId: "schedule-1",
          createdAt: CREATED_AT,
          startedAt: CREATED_AT,
          lastHeartbeatAt: UPDATED_AT,
          completedAt: UPDATED_AT,
          _count: {
            attempts: 1,
            events: 3,
          },
        },
      ],
    });

    await expect(getTask({ auth, taskId: TASK_ID })).resolves.toEqual({
      ok: true,
      status: 200,
      task: {
        id: TASK_ID,
        slug: "hello",
        name: "Hello",
        description: "Greets a user",
        executionConfig: EXECUTION_CONFIG,
        createdAt: CREATED_AT.toISOString(),
        updatedAt: UPDATED_AT.toISOString(),
        deployment: {
          id: "deployment-1",
          version: "v1",
          image: "ghcr.io/cascade/worker:v1",
          status: "ACTIVE",
          runtimeStatus: "RUNNING",
        },
        runsCount: 4,
        schedulesCount: 2,
        schedules: [
          {
            id: "schedule-1",
            name: "Every hour",
            scheduleType: "INTERVAL",
            intervalSeconds: 3_600,
            cronExpression: null,
            timezone: "UTC",
            nextRunAt: CREATED_AT.toISOString(),
            lastRunAt: null,
            enabled: true,
            hasPayload: true,
            revision: 1,
            createdAt: CREATED_AT.toISOString(),
            updatedAt: UPDATED_AT.toISOString(),
          },
        ],
        recentRuns: [
          {
            id: "run-1",
            status: "COMPLETED",
            deploymentId: "deployment-1",
            scheduleId: "schedule-1",
            attemptsCount: 1,
            eventsCount: 3,
            createdAt: CREATED_AT.toISOString(),
            startedAt: CREATED_AT.toISOString(),
            lastHeartbeatAt: UPDATED_AT.toISOString(),
            completedAt: UPDATED_AT.toISOString(),
          },
        ],
      },
    });

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: TASK_ID,
        environmentId: ENVIRONMENT_ID,
        executionConfig: {
          not: dbNull,
        },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        executionConfig: true,
        createdAt: true,
        updatedAt: true,
        deployment: {
          select: {
            id: true,
            version: true,
            image: true,
            status: true,
            runtimeStatus: true,
          },
        },
        schedules: {
          orderBy: {
            nextRunAt: "asc",
          },
          take: 50,
          select: {
            id: true,
            name: true,
            scheduleType: true,
            intervalSeconds: true,
            cronExpression: true,
            timezone: true,
            nextRunAt: true,
            lastRunAt: true,
            enabled: true,
            payload: true,
            revision: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        runs: {
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
          select: {
            id: true,
            status: true,
            deploymentId: true,
            scheduleId: true,
            createdAt: true,
            startedAt: true,
            lastHeartbeatAt: true,
            completedAt: true,
            _count: {
              select: {
                attempts: true,
                events: true,
              },
            },
          },
        },
        _count: {
          select: {
            runs: true,
            schedules: true,
          },
        },
      },
    });
  });

  it("does not expose a task outside the authenticated environment", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(getTask({ auth, taskId: TASK_ID })).resolves.toEqual({
      ok: false,
      status: 404,
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task was not found in this environment",
      },
    });
  });

  it("rejects an invalid task ID before querying the database", async () => {
    await expect(getTask({ auth, taskId: "not-a-uuid" })).resolves.toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_TASK_ID",
        message: "taskId must be a valid UUID",
      },
    });

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
  });
});
