import { describe, expect, it } from "vitest";
import {
  ApiErrorResponseSchema,
  ListTaskSchedulesResponseSchema,
  ListTaskRunsResponseSchema,
  ListTasksResponseSchema,
  TaskRunDetailResponseSchema,
  TaskRunEventsResponseSchema,
  TriggerTaskRunResponseSchema,
  apiContracts,
} from "../src/index.js";

describe("apiContracts", () => {
  it("requires pagination on list endpoints", () => {
    const listContracts = Object.values(apiContracts).filter(
      (contract) => contract.kind === "list",
    );

    expect(listContracts).not.toHaveLength(0);
    expect(listContracts.every((contract) => contract.retrySafety === "safe")).toBe(true);
    expect(listContracts.every((contract) => contract.pagination === "required")).toBe(true);
    expect(listContracts.every((contract) => contract.responses[200] !== undefined)).toBe(true);
  });

  it("requires explicit idempotency semantics on trigger mutations", () => {
    const mutationContracts = Object.values(apiContracts).filter(
      (contract) => contract.kind === "mutation" && contract.path.endsWith("/trigger"),
    );

    expect(mutationContracts).not.toHaveLength(0);
    expect(mutationContracts.every((contract) => contract.retrySafety === "idempotency-key")).toBe(
      true,
    );
    expect(
      mutationContracts.every(
        (contract) =>
          "idempotencyHeader" in contract && contract.idempotencyHeader === "Idempotency-Key",
      ),
    ).toBe(true);
  });

  it("declares structured errors for every non-success status", () => {
    for (const contract of Object.values(apiContracts)) {
      for (const [status, schema] of Object.entries(contract.responses)) {
        if (Number(status) < 400) {
          continue;
        }

        expect(schema).toBe(ApiErrorResponseSchema);
        expect(contract.errorCodes).not.toHaveLength(0);
      }
    }
  });
});

describe("response schemas", () => {
  it("parses the selected list and trigger response bodies", () => {
    expect(() => ListTasksResponseSchema.parse(createListTasksResponse())).not.toThrow();
    expect(() => ListTaskRunsResponseSchema.parse(createListTaskRunsResponse())).not.toThrow();
    expect(() => TriggerTaskRunResponseSchema.parse(createTriggerTaskRunResponse())).not.toThrow();
    expect(() =>
      ListTaskSchedulesResponseSchema.parse(createListTaskSchedulesResponse()),
    ).not.toThrow();
    expect(() => TaskRunDetailResponseSchema.parse(createTaskRunDetailResponse())).not.toThrow();
    expect(() => TaskRunEventsResponseSchema.parse(createTaskRunEventsResponse())).not.toThrow();
  });
});

function createListTasksResponse() {
  return {
    tasks: [
      {
        id: "task-1",
        slug: "hello",
        name: "Hello",
        description: null,
        deployment: {
          id: "deployment-1",
          version: "v1",
          status: "ACTIVE",
        },
        runsCount: 1,
        schedulesCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    pagination: {
      limit: 50,
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    },
  };
}

function createListTaskRunsResponse() {
  return {
    taskRuns: [
      {
        id: "run-1",
        status: "COMPLETED",
        createdAt: "2026-01-01T00:00:00.000Z",
        startedAt: null,
        lastHeartbeatAt: null,
        completedAt: "2026-01-01T00:01:00.000Z",
        task: {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          environment: {
            id: "environment-1",
            slug: "dev",
            name: "Development",
            project: {
              id: "project-1",
              slug: "cascade",
              name: "Cascade",
            },
          },
        },
        attemptsCount: 1,
        eventsCount: 2,
      },
    ],
    pagination: {
      limit: 50,
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    },
  };
}

function createTriggerTaskRunResponse() {
  return {
    idempotentReplayed: false,
    taskRun: {
      id: "run-1",
      taskId: "task-1",
      taskSlug: "hello",
      taskName: "Hello",
      status: "PENDING",
      payload: {
        message: "hello",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      idempotentReplay: false,
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    },
  };
}

function createListTaskSchedulesResponse() {
  return {
    schedules: [
      {
        id: "schedule-1",
        taskId: "task-1",
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        nextRunAt: "2026-01-03T09:00:00.000Z",
        lastRunAt: null,
        enabled: true,
        hasPayload: true,
        revision: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        task: {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          deployment: {
            id: "deployment-1",
            version: "v1",
            status: "ACTIVE",
          },
        },
      },
    ],
    pagination: {
      limit: 50,
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    },
  };
}

function createTaskRunDetailResponse() {
  return {
    taskRun: {
      id: "run-1",
      status: "FAILED",
      deploymentId: null,
      scheduleId: null,
      payload: {
        message: "hello",
      },
      output: null,
      error: {
        code: "TASK_FAILED",
      },
      delayUntil: null,
      startedAt: "2026-01-01T00:00:05.000Z",
      lastHeartbeatAt: "2026-01-01T00:00:10.000Z",
      completedAt: "2026-01-01T00:00:15.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:16.000Z",
      task: {
        id: "task-1",
        slug: "hello",
        name: "Hello",
        environment: {
          id: "environment-1",
          slug: "dev",
          name: "Development",
          project: {
            id: "project-1",
            slug: "cascade",
            name: "Cascade",
          },
        },
      },
      attemptsCount: 1,
      eventsCount: 1,
      traceId: "trace-1",
      triggerSpanId: "span-1",
      attempts: [
        {
          id: "attempt-1",
          attemptNumber: 1,
          status: "FAILED",
          error: {
            code: "TASK_FAILED",
          },
          startedAt: "2026-01-01T00:00:05.000Z",
          completedAt: "2026-01-01T00:00:15.000Z",
          createdAt: "2026-01-01T00:00:05.000Z",
        },
      ],
    },
  };
}

function createTaskRunEventsResponse() {
  return {
    events: [
      {
        id: "event-1",
        taskAttemptId: "attempt-1",
        type: "task.log",
        level: "ERROR",
        message: "Task failed",
        data: {
          retryable: false,
        },
        traceId: "trace-1",
        spanId: "span-2",
        parentSpanId: "span-1",
        createdAt: "2026-01-01T00:00:12.000Z",
      },
    ],
    nextCursor: null,
    hasMore: false,
  };
}
