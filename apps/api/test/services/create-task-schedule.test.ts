import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type CreatedSchedule = {
  id: string;
  taskId: string;
  name: string;
  intervalSeconds: number;
  nextRunAt: Date;
  enabled: boolean;
  payload: unknown;
  createdAt: Date;
};

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";
const ENVIRONMENT_ID = "environment-1";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const NEXT_RUN_AT = new Date("2026-01-01T00:01:00.000Z");
const PAYLOAD = { message: "scheduled hello" };

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const mocks = vi.hoisted(() => ({
  prisma: {
    task: {
      findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
    },
    taskSchedule: {
      create: vi.fn<(args: unknown) => Promise<CreatedSchedule>>(),
    },
  },
  maybeStoreJsonValue: vi.fn<(input: { value: unknown }) => Promise<unknown>>(),
}));

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma: mocks.prisma,
}));

vi.mock("@cascade/storage", () => ({
  maybeStoreJsonValue: mocks.maybeStoreJsonValue,
}));

const { createTaskSchedule } = await import("../../src/services/create-task-schedule.js");

function scheduleBody(overrides: Record<string, unknown> = {}) {
  return {
    intervalSeconds: 60,
    ...overrides,
  };
}

function createSchedule(input: { taskId?: string; body?: unknown } = {}) {
  return createTaskSchedule({
    auth,
    taskId: input.taskId ?? TASK_ID,
    body: input.body ?? scheduleBody(),
  });
}

function expectNoWrites() {
  expect(mocks.prisma.task.findFirst).not.toHaveBeenCalled();
  expect(mocks.prisma.taskSchedule.create).not.toHaveBeenCalled();
}

const SCHEDULE_SELECT = {
  id: true,
  taskId: true,
  name: true,
  intervalSeconds: true,
  nextRunAt: true,
  enabled: true,
  payload: true,
  createdAt: true,
};

describe("createTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.maybeStoreJsonValue.mockImplementation(async (input) => input.value);
    mocks.prisma.task.findFirst.mockResolvedValue({
      id: TASK_ID,
      name: "Hello",
    });
    mocks.prisma.taskSchedule.create.mockResolvedValue({
      id: SCHEDULE_ID,
      taskId: TASK_ID,
      name: "Every minute",
      intervalSeconds: 60,
      nextRunAt: NEXT_RUN_AT,
      enabled: true,
      payload: PAYLOAD,
      createdAt: CREATED_AT,
    });
  });

  it.each([
    {
      name: "invalid task ids",
      input: { taskId: "not-a-uuid", body: scheduleBody() },
      error: {
        code: "INVALID_TASK_ID",
        message: "taskId must be a valid UUID",
      },
    },
    {
      name: "non-object schedule bodies",
      input: { body: ["not", "an", "object"] },
      error: {
        code: "INVALID_BODY",
        message: "Body must be an object",
      },
    },
    {
      name: "intervalSeconds below 60",
      input: { body: scheduleBody({ intervalSeconds: 30 }) },
      error: {
        code: "INVALID_INTERVAL_SECONDS",
        message: "intervalSeconds must be an integer between 60 and 31536000",
      },
    },
    {
      name: "intervals longer than one year",
      input: { body: scheduleBody({ intervalSeconds: 31_536_001 }) },
      error: {
        code: "INVALID_INTERVAL_SECONDS",
        message: "intervalSeconds must be an integer between 60 and 31536000",
      },
    },
    {
      name: "invalid startAt values",
      input: { body: scheduleBody({ startAt: "not-a-date" }) },
      error: {
        code: "INVALID_START_AT",
        message: "startAt must be a valid UTC ISO 8601 timestamp",
      },
    },
    {
      name: "impossible UTC startAt dates",
      input: { body: scheduleBody({ startAt: "2026-02-30T00:00:00.000Z" }) },
      error: {
        code: "INVALID_START_AT",
        message: "startAt must be a valid UTC ISO 8601 timestamp",
      },
    },
    {
      name: "schedule names longer than 200 characters",
      input: { body: scheduleBody({ name: "x".repeat(201) }) },
      error: {
        code: "INVALID_SCHEDULE_NAME",
        message: "name must be a non-empty string with at most 200 characters",
      },
    },
  ])("rejects $name before opening a transaction", async ({ input, error }) => {
    await expect(createSchedule(input)).resolves.toEqual({
      ok: false,
      status: 400,
      error,
    });

    expectNoWrites();
  });

  it("rejects tasks outside the authenticated environment", async () => {
    mocks.prisma.task.findFirst.mockResolvedValue(null);

    await expect(createSchedule()).resolves.toEqual({
      ok: false,
      status: 404,
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task was not found in this environment",
      },
    });

    expect(mocks.prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: TASK_ID,
        environmentId: ENVIRONMENT_ID,
      },
      select: {
        id: true,
        name: true,
      },
    });
    expect(mocks.prisma.taskSchedule.create).not.toHaveBeenCalled();
  });

  it("creates a schedule with payload and explicit startAt", async () => {
    const result = await createSchedule({
      body: scheduleBody({
        name: " Every minute ",
        startAt: NEXT_RUN_AT.toISOString(),
        payload: PAYLOAD,
      }),
    });

    expect(result).toEqual({
      ok: true,
      status: 201,
      schedule: {
        id: SCHEDULE_ID,
        taskId: TASK_ID,
        name: "Every minute",
        intervalSeconds: 60,
        nextRunAt: NEXT_RUN_AT.toISOString(),
        enabled: true,
        payload: PAYLOAD,
        createdAt: CREATED_AT.toISOString(),
      },
    });

    expect(mocks.maybeStoreJsonValue).toHaveBeenCalledWith({
      kind: "PAYLOAD",
      environmentId: ENVIRONMENT_ID,
      taskId: TASK_ID,
      runId: TASK_ID,
      value: PAYLOAD,
    });
    expect(mocks.prisma.taskSchedule.create).toHaveBeenCalledWith({
      data: {
        taskId: TASK_ID,
        name: "Every minute",
        intervalSeconds: 60,
        nextRunAt: NEXT_RUN_AT,
        payload: PAYLOAD,
      },
      select: SCHEDULE_SELECT,
    });
  });
});
