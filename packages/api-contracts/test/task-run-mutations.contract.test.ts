import { describe, expect, it } from "vitest";
import {
  apiContracts,
  CancelTaskRunResponseSchema,
  ReplayTaskRunResponseSchema,
} from "../src/index.js";

describe("task-run mutation API contracts", () => {
  it("declares cancel and replay endpoints", () => {
    expect(apiContracts.cancelTaskRun).toMatchObject({
      method: "POST",
      path: "/api/runs/:runId/cancel",
      kind: "mutation",
      retrySafety: "unsafe",
    });

    expect(apiContracts.replayTaskRun).toMatchObject({
      method: "POST",
      path: "/api/runs/:runId/replay",
      kind: "mutation",
      retrySafety: "unsafe",
    });
  });

  it("parses cancel and replay responses", () => {
    expect(() =>
      CancelTaskRunResponseSchema.parse({
        taskRun: {
          id: "run-1",
          taskId: "task-1",
          status: "CANCELED",
          canceled: true,
          alreadyCanceled: false,
        },
      }),
    ).not.toThrow();

    expect(() =>
      ReplayTaskRunResponseSchema.parse({
        taskRun: {
          id: "run-2",
          taskId: "task-1",
          status: "PENDING",
          payload: {
            message: "hello",
          },
          createdAt: "2026-08-24T10:00:00.000Z",
          replayedFromRunId: "run-1",
        },
      }),
    ).not.toThrow();
  });
});
