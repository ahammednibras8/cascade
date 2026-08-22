import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

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
    count: vi.fn<(args: unknown) => Promise<number>>(),
    findMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { listTaskSchedules } =
  await import("../../../src/features/schedules/list-task-schedules.js");

describe("listTaskSchedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns schedules from the authenticated environment", async () => {
    prisma.taskSchedule.count.mockResolvedValue(1);
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

    await expect(listTaskSchedules({ auth, query: {} })).resolves.toEqual({
      ok: true,
      status: 200,
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      },
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

    expect(prisma.taskSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          task: {
            environmentId: ENVIRONMENT_ID,
          },
        },
      }),
    );
  });

  it("returns an empty list when the environment has no schedules", async () => {
    prisma.taskSchedule.count.mockResolvedValue(0);
    prisma.taskSchedule.findMany.mockResolvedValue([]);

    await expect(listTaskSchedules({ auth, query: {} })).resolves.toEqual({
      ok: true,
      status: 200,
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 0,
      },
      schedules: [],
    });
  });
});

describe("listTaskSchedules filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies schedule filters and requests one extra record for cursor pagination", async () => {
    prisma.taskSchedule.count.mockResolvedValue(0);
    prisma.taskSchedule.findMany.mockResolvedValue([]);

    await expect(
      listTaskSchedules({
        auth,
        query: {
          limit: "25",
          taskId: "11111111-1111-4111-8111-111111111111",
          enabled: "false",
          scheduleType: "CRON",
          nextRunAfter: "2026-01-01T00:00:00.000Z",
          nextRunBefore: "2026-01-31T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 200,
      pagination: {
        limit: 25,
        totalCount: 0,
      },
    });

    expect(prisma.taskSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
        take: 26,
        where: {
          task: {
            environmentId: ENVIRONMENT_ID,
          },
          taskId: "11111111-1111-4111-8111-111111111111",
          enabled: false,
          scheduleType: "CRON",
          nextRunAt: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lte: new Date("2026-01-31T00:00:00.000Z"),
          },
        },
      }),
    );
  });

  it("rejects invalid schedule list filters", async () => {
    await expect(
      listTaskSchedules({
        auth,
        query: {
          enabled: "yes",
        },
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "enabled must be either true or false",
      },
    });

    expect(prisma.taskSchedule.findMany).not.toHaveBeenCalled();
    expect(prisma.taskSchedule.count).not.toHaveBeenCalled();
  });
});
