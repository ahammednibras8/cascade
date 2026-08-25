import { describe, expect, it } from "vitest";
import { apiContracts, TaskScheduleDetailResponseSchema } from "../src/index.js";

describe("schedule detail API contract", () => {
  it("declares the schedule-detail endpoint", () => {
    expect(apiContracts.getTaskSchedule).toMatchObject({
      method: "GET",
      path: "/api/schedules/:scheduleId",
      kind: "detail",
      retrySafety: "safe",
    });
  });

  it("parses a schedule-detail response", () => {
    expect(() =>
      TaskScheduleDetailResponseSchema.parse(createScheduleDetailResponse()),
    ).not.toThrow();
  });
});

function createScheduleDetailResponse() {
  return {
    schedule: {
      id: "schedule-1",
      taskId: "task-1",
      name: "Weekday morning",
      scheduleType: "CRON",
      intervalSeconds: null,
      cronExpression: "0 9 * * 1-5",
      timezone: "Asia/Kolkata",
      nextRunAt: "2026-08-25T09:00:00.000Z",
      lastRunAt: null,
      enabled: true,
      payload: {
        customerId: "customer-1",
      },
      revision: 2,
      createdAt: "2026-08-20T09:00:00.000Z",
      updatedAt: "2026-08-21T09:00:00.000Z",
      task: {
        id: "task-1",
        slug: "hello",
        name: "Hello",
      },
    },
  };
}
