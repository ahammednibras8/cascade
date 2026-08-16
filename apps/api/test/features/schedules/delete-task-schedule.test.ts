import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";
const ENVIRONMENT_ID = "environment-1";

const auth = {
  apiKeyId: "api-key-1",
  environmentId: ENVIRONMENT_ID,
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

const prisma = vi.hoisted(() => ({
  taskSchedule: {
    deleteMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { deleteTaskSchedule } =
  await import("../../../src/features/schedules/delete-task-schedule.js");

describe("deleteTaskSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a schedule in the authenticated environment", async () => {
    prisma.taskSchedule.deleteMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      deleteTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: true,
      status: 204,
    });

    expect(prisma.taskSchedule.deleteMany).toHaveBeenCalledWith({
      where: {
        id: SCHEDULE_ID,
        task: {
          environmentId: ENVIRONMENT_ID,
        },
      },
    });
  });

  it("does not expose schedules from another environment", async () => {
    prisma.taskSchedule.deleteMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      deleteTaskSchedule({
        auth,
        scheduleId: SCHEDULE_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: {
        code: "SCHEDULE_NOT_FOUND",
        message: "Schedule was not found in this environment",
      },
    });
  });

  it("rejects invalid schedule IDs before querying the database", async () => {
    await expect(
      deleteTaskSchedule({
        auth,
        scheduleId: "not-a-uuid",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_SCHEDULE_ID",
        message: "scheduleId must be a valid UUID",
      },
    });

    expect(prisma.taskSchedule.deleteMany).not.toHaveBeenCalled();
  });
});
