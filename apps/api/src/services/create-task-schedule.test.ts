import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../auth/api-key.js";

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
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
  taskSchedule: {
    create: vi.fn<(args: unknown) => Promise<CreatedSchedule>>(),
  },
}));

const maybeStoreJsonValue = vi.hoisted(() =>
  vi.fn<(input: { value: unknown }) => Promise<unknown>>(),
);

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma,
}));

vi.mock("@cascade/storage", () => ({
  maybeStoreJsonValue,
}));

const { createTaskSchedule } = await import("./create-task-schedule.js");

describe("createTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    maybeStoreJsonValue.mockImplementation(async (input) => input.value);

    prisma.task.findFirst.mockResolvedValue({
      id: TASK_ID,
      name: "Hello",
    });

    prisma.taskSchedule.create.mockResolvedValue({
      id: SCHEDULE_ID,
      taskId: TASK_ID,
      name: "Every minute",
      intervalSeconds: 60,
      nextRunAt: new Date("2026-01-01T00:01:00.000Z"),
      enabled: true,
      payload: {
        message: "scheduled hello",
      },
      createdAt: CREATED_AT,
    });
  });

  it("rejects invalid task ids", async () => {
    const result = await createTaskSchedule({
      auth,
      taskId: "not-a-uuid",
      body: {
        intervalSeconds: 60,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_TASK_ID",
        message: "taskId must be a valid UUID",
      },
    });

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
    expect(prisma.taskSchedule.create).not.toHaveBeenCalled();
  });

  it("rejects intervalSeconds below 60", async () => {
    const result = await createTaskSchedule({
      auth,
      taskId: TASK_ID,
      body: {
        intervalSeconds: 30,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_INTERVAL_SECONDS",
        message: "intervalSeconds must be an integer greater than or equal to 60",
      },
    });

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
    expect(prisma.taskSchedule.create).not.toHaveBeenCalled();
  });

  it("rejects invalid startAt values", async () => {
    const result = await createTaskSchedule({
      auth,
      taskId: TASK_ID,
      body: {
        intervalSeconds: 60,
        startAt: "not-a-date",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_START_AT",
        message: "startAt must be a valid ISO date string",
      },
    });

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
    expect(prisma.taskSchedule.create).not.toHaveBeenCalled();
  });

  it("rejects tasks outside the authenticated environment", async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    const result = await createTaskSchedule({
      auth,
      taskId: TASK_ID,
      body: {
        intervalSeconds: 60,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task was not found in this environment",
      },
    });

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: TASK_ID,
        environmentId: auth.environmentId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    expect(prisma.taskSchedule.create).not.toHaveBeenCalled();
  });

  it("creates a schedule with payload and explicit startAt", async () => {
    const startAt = "2026-01-01T00:01:00.000Z";

    const result = await createTaskSchedule({
      auth,
      taskId: TASK_ID,
      body: {
        name: " Every minute ",
        intervalSeconds: 60,
        startAt,
        payload: {
          message: "scheduled hello",
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      status: 201,
      schedule: {
        id: SCHEDULE_ID,
        taskId: TASK_ID,
        name: "Every minute",
        intervalSeconds: 60,
        nextRunAt: "2026-01-01T00:01:00.000Z",
        enabled: true,
        payload: {
          message: "scheduled hello",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(maybeStoreJsonValue).toHaveBeenCalledWith({
      kind: "PAYLOAD",
      environmentId: auth.environmentId,
      taskId: TASK_ID,
      runId: TASK_ID,
      value: {
        message: "scheduled hello",
      },
    });

    expect(prisma.taskSchedule.create).toHaveBeenCalledWith({
      data: {
        taskId: TASK_ID,
        name: "Every minute",
        intervalSeconds: 60,
        nextRunAt: new Date(startAt),
        payload: {
          message: "scheduled hello",
        },
      },
      select: {
        id: true,
        taskId: true,
        name: true,
        intervalSeconds: true,
        nextRunAt: true,
        enabled: true,
        payload: true,
        createdAt: true,
      },
    });
  });
});
