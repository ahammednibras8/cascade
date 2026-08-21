import { describe, expect, it } from "vitest";
import {
  ApiErrorResponseSchema,
  ListTaskRunsResponseSchema,
  ListTasksResponseSchema,
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
