import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

const ENVIRONMENT_ID = "environment-1";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-01-02T00:00:00.000Z");
const NEXT_RUN_AT = new Date("2026-01-03T09:00:00.000Z");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  taskSchedule: {
    findMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { listTaskSchedules } = await import("../../src/services/list-task-schedules.js");

describe("listTaskSchedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns schedules from the authenticated environment", async () => {
    prisma.taskSchedule.findMany.mockResolvedValue([
      {
        id: "schedule-1",
        taskId: "task-1",
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        nextRunAt: NEXT_RUN_AT,
        lastRunAt: null,
        enabled: true,
        payload: {
          customerId: "customer-1",
        },
        revision: 3,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        task: {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          deployment: {
            id: "deployment-1",
            version: "v3",
            status: "ACTIVE",
          },
        },
      },
    ]);

    await expect(listTaskSchedules({ auth })).resolves.toEqual({
      ok: true,
      status: 200,
      schedules: [
        {
          id: "schedule-1",
          taskId: "task-1",
          name: "Weekday morning",
          scheduleType: "CRON",
          intervalSeconds: null,
          cronExpression: "0 9 * * 1-5",
          timezone: "Asia/Kolkata",
          nextRunAt: NEXT_RUN_AT.toISOString(),
          lastRunAt: null,
          enabled: true,
          hasPayload: true,
          revision: 3,
          createdAt: CREATED_AT.toISOString(),
          updatedAt: UPDATED_AT.toISOString(),
          task: {
            id: "task-1",
            slug: "hello",
            name: "Hello",
            deployment: {
              id: "deployment-1",
              version: "v3",
              status: "ACTIVE",
            },
          },
        },
      ],
    });

    expect(prisma.taskSchedule.findMany).toHaveBeenCalledWith({
      where: {
        task: {
          environmentId: ENVIRONMENT_ID,
        },
      },
      orderBy: {
        nextRunAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        taskId: true,
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
        task: {
          select: {
            id: true,
            slug: true,
            name: true,
            deployment: {
              select: {
                id: true,
                version: true,
                status: true,
              },
            },
          },
        },
      },
    });
  });

  it("returns an empty list when the environment has no schedules", async () => {
    prisma.taskSchedule.findMany.mockResolvedValue([]);

    await expect(listTaskSchedules({ auth })).resolves.toEqual({
      ok: true,
      status: 200,
      schedules: [],
    });
  });
});
