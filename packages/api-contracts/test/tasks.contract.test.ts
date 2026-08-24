import { describe, expect, it } from "vitest";
import { apiContracts, TaskDetailResponseSchema } from "../src/index.js";

describe("task detail API contract", () => {
  it("declares the task-detail endpoint", () => {
    expect(apiContracts.getTask).toMatchObject({
      method: "GET",
      path: "/api/tasks/:taskId",
      kind: "detail",
      retrySafety: "safe",
    });
  });

  it("parses a task-detail response", () => {
    expect(() => TaskDetailResponseSchema.parse(createTaskDetailResponse())).not.toThrow();
  });
});

function createTaskDetailResponse() {
  return {
    task: {
      id: "task-1",
      slug: "hello",
      name: "Hello",
      description: "Greets a user",
      executionConfig: {
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
      },
      deployment: {
        id: "deployment-1",
        version: "v1",
        image: "ghcr.io/cascade/worker:v1",
        status: "ACTIVE",
        runtimeStatus: "RUNNING",
      },
      runsCount: 3,
      schedulesCount: 1,
      schedules: [
        {
          id: "schedule-1",
          name: "Every hour",
          scheduleType: "INTERVAL",
          intervalSeconds: 3600,
          cronExpression: null,
          timezone: "UTC",
          nextRunAt: "2026-08-20T10:00:00.000Z",
          lastRunAt: null,
          enabled: true,
          hasPayload: false,
          revision: 1,
          createdAt: "2026-08-20T09:00:00.000Z",
          updatedAt: "2026-08-20T09:00:00.000Z",
        },
      ],
      recentRuns: [
        {
          id: "run-1",
          status: "COMPLETED",
          deploymentId: "deployment-1",
          scheduleId: "schedule-1",
          attemptsCount: 1,
          eventsCount: 2,
          createdAt: "2026-08-20T09:00:00.000Z",
          startedAt: "2026-08-20T09:00:01.000Z",
          lastHeartbeatAt: "2026-08-20T09:00:02.000Z",
          completedAt: "2026-08-20T09:00:03.000Z",
        },
      ],
      createdAt: "2026-08-20T08:00:00.000Z",
      updatedAt: "2026-08-20T09:00:00.000Z",
    },
  };
}
