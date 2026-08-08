import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type CreatedSchedule = {
  id: string;
  taskId: string;
  name: string;
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
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
const CRON_NEXT_RUN_AT = new Date("2026-01-05T03:30:00.000Z");
const PAYLOAD = { message: "scheduled hello" };
const CRON = "0 9 * * 1-5";
const KOLKATA = "Asia/Kolkata";

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const mocks = vi.hoisted(() => ({
  prisma: {
    task: { findFirst: vi.fn<(args: unknown) => Promise<unknown>>() },
    taskSchedule: { create: vi.fn<(args: unknown) => Promise<CreatedSchedule>>() },
  },
  maybeStoreJsonValue: vi.fn<(input: { value: unknown }) => Promise<unknown>>(),
}));

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma: mocks.prisma,
}));

vi.mock("@cascade/storage", () => ({ maybeStoreJsonValue: mocks.maybeStoreJsonValue }));

const { createTaskSchedule } = await import("../../src/services/create-task-schedule.js");

const SCHEDULE_SELECT = {
  id: true,
  taskId: true,
  name: true,
  scheduleType: true,
  intervalSeconds: true,
  cronExpression: true,
  timezone: true,
  nextRunAt: true,
  enabled: true,
  payload: true,
  createdAt: true,
};

function intervalBody(overrides: Record<string, unknown> = {}) {
  return { intervalSeconds: 60, ...overrides };
}

function cronBody(overrides: Record<string, unknown> = {}) {
  return {
    scheduleType: "CRON",
    cronExpression: CRON,
    timezone: KOLKATA,
    ...overrides,
  };
}

function createdSchedule(overrides: Partial<CreatedSchedule> = {}): CreatedSchedule {
  return {
    id: SCHEDULE_ID,
    taskId: TASK_ID,
    name: "Every minute",
    scheduleType: "INTERVAL",
    intervalSeconds: 60,
    cronExpression: null,
    timezone: "UTC",
    nextRunAt: NEXT_RUN_AT,
    enabled: true,
    payload: PAYLOAD,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function createSchedule(input: { taskId?: string; body?: unknown } = {}) {
  return createTaskSchedule({
    auth,
    taskId: input.taskId ?? TASK_ID,
    body: input.body ?? intervalBody(),
  });
}

function expectNoWrites() {
  expect(mocks.prisma.task.findFirst).not.toHaveBeenCalled();
  expect(mocks.prisma.taskSchedule.create).not.toHaveBeenCalled();
}

function expectScheduleCreate(data: Record<string, unknown>) {
  expect(mocks.prisma.taskSchedule.create).toHaveBeenCalledWith({
    data,
    select: SCHEDULE_SELECT,
  });
}

describe("createTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeStoreJsonValue.mockImplementation(async (input) => input.value);
    mocks.prisma.task.findFirst.mockResolvedValue({ id: TASK_ID, name: "Hello" });
    mocks.prisma.taskSchedule.create.mockResolvedValue(createdSchedule());
  });

  it.each([
    [
      "invalid task ids",
      { taskId: "not-a-uuid", body: intervalBody() },
      { code: "INVALID_TASK_ID", message: "taskId must be a valid UUID" },
    ],
    [
      "non-object schedule bodies",
      { body: ["not", "an", "object"] },
      { code: "INVALID_BODY", message: "Body must be an object" },
    ],
    [
      "short intervals",
      { body: intervalBody({ intervalSeconds: 30 }) },
      {
        code: "INVALID_INTERVAL_SECONDS",
        message: "intervalSeconds must be an integer between 60 and 31536000",
      },
    ],
    [
      "intervals longer than one year",
      { body: intervalBody({ intervalSeconds: 31_536_001 }) },
      {
        code: "INVALID_INTERVAL_SECONDS",
        message: "intervalSeconds must be an integer between 60 and 31536000",
      },
    ],
    [
      "invalid startAt values",
      { body: intervalBody({ startAt: "not-a-date" }) },
      { code: "INVALID_START_AT", message: "startAt must be a valid UTC ISO 8601 timestamp" },
    ],
    [
      "impossible UTC startAt dates",
      { body: intervalBody({ startAt: "2026-02-30T00:00:00.000Z" }) },
      { code: "INVALID_START_AT", message: "startAt must be a valid UTC ISO 8601 timestamp" },
    ],
    [
      "long schedule names",
      { body: intervalBody({ name: "x".repeat(201) }) },
      {
        code: "INVALID_SCHEDULE_NAME",
        message: "name must be a non-empty string with at most 200 characters",
      },
    ],
    [
      "unknown schedule types",
      { body: intervalBody({ scheduleType: "ONCE" }) },
      { code: "INVALID_SCHEDULE_TYPE", message: "scheduleType must be INTERVAL or CRON" },
    ],
    [
      "cron schedules with intervalSeconds",
      { body: cronBody({ intervalSeconds: 60 }) },
      { code: "INVALID_SCHEDULE_RULE", message: "CRON schedules must not include intervalSeconds" },
    ],
    [
      "invalid cron expressions",
      { body: cronBody({ cronExpression: "not a cron expression" }) },
      {
        code: "INVALID_CRON_SCHEDULE",
        message:
          "cronExpression must be a valid five-field cron expression and timezone must be a valid IANA timezone",
      },
    ],
  ])("rejects %s before writing", async (_name, input, error) => {
    await expect(createSchedule(input)).resolves.toEqual({ ok: false, status: 400, error });
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
      where: { id: TASK_ID, environmentId: ENVIRONMENT_ID },
      select: { id: true, name: true },
    });
    expect(mocks.prisma.taskSchedule.create).not.toHaveBeenCalled();
  });

  it("creates an interval schedule with payload and explicit startAt", async () => {
    const result = await createSchedule({
      body: intervalBody({
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
        scheduleType: "INTERVAL",
        intervalSeconds: 60,
        cronExpression: null,
        timezone: "UTC",
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
    expectScheduleCreate({
      taskId: TASK_ID,
      name: "Every minute",
      scheduleType: "INTERVAL",
      intervalSeconds: 60,
      cronExpression: null,
      timezone: "UTC",
      nextRunAt: NEXT_RUN_AT,
      payload: PAYLOAD,
    });
  });

  it("creates a cron schedule and calculates its first matching occurrence", async () => {
    mocks.prisma.taskSchedule.create.mockResolvedValueOnce(
      createdSchedule({
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: CRON,
        timezone: KOLKATA,
        nextRunAt: CRON_NEXT_RUN_AT,
        payload: null,
      }),
    );

    await expect(
      createSchedule({
        body: cronBody({
          name: " Weekday morning ",
          startAt: "2026-01-05T03:29:59.000Z",
        }),
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 201,
      schedule: {
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: CRON,
        timezone: KOLKATA,
        nextRunAt: CRON_NEXT_RUN_AT.toISOString(),
      },
    });
    expectScheduleCreate({
      taskId: TASK_ID,
      name: "Weekday morning",
      scheduleType: "CRON",
      intervalSeconds: null,
      cronExpression: CRON,
      timezone: KOLKATA,
      nextRunAt: CRON_NEXT_RUN_AT,
    });
  });
});
