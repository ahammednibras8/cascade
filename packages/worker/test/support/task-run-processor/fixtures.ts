import type { TaskDefinition, TaskExecutionConfig } from "@cascade/core";
import type { TaskRunQueueMessage } from "../../../src/queue/task-runs.js";
import type { LoadedTaskRegistry } from "../../../src/tasks/load-registry.js";

export const RUN_ID = "run-1";
export const TASK_ID = "task-1";
export const ENVIRONMENT_ID = "environment-1";
export const ATTEMPT_ID = "attempt-1";
export const TRACE_ID = "11111111111111111111111111111111";
export const SPAN_ID = "2222222222222222";
export const PARENT_SPAN_ID = "3333333333333333";

export function createTaskExecutionConfig(): TaskExecutionConfig {
  return {
    schemaVersion: 1,
    timeoutMs: 30_000,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
      exponentialBackoff: false,
    },
    queue: {
      name: "hello",
      concurrencyLimit: null,
    },
  };
}

export function resetTaskExecutionConfig(config: TaskExecutionConfig) {
  config.timeoutMs = 30_000;
  config.retry.maxAttempts = 1;
  config.retry.delayMs = 0;
  config.retry.exponentialBackoff = false;
  config.queue.name = "hello";
  config.queue.concurrencyLimit = null;
}

export function createMessage() {
  return {
    runId: RUN_ID,
    taskId: TASK_ID,
    environmentId: ENVIRONMENT_ID,
    deploymentId: null,
  } satisfies TaskRunQueueMessage;
}

export function createPendingTaskRun(executionConfig: TaskExecutionConfig) {
  return {
    id: RUN_ID,
    taskId: TASK_ID,
    status: "PENDING",
    payload: {
      message: "hello",
    },
    delayUntil: null,
    traceId: TRACE_ID,
    triggerSpanId: PARENT_SPAN_ID,
    executionConfig,
    task: {
      slug: "hello",
      name: "Hello",
    },
  };
}

export function createAttempt(attemptNumber = 1) {
  return {
    id: ATTEMPT_ID,
    attemptNumber,
  };
}

export function createTaskRegistry(localTaskRun: (context: unknown) => Promise<unknown>) {
  return {
    get(id: string) {
      if (id !== "hello") {
        return undefined;
      }

      return {
        id: "hello",
        timeoutMs: 30_000,
        retry: {
          maxAttempts: 1,
          delayMs: 0,
          exponentialBackoff: false,
        },
        queue: {
          name: "hello",
          concurrencyLimit: null,
        },
        run: localTaskRun,
      };
    },

    has(id: string) {
      return id === "hello";
    },

    list() {
      const task = this.get("hello") as TaskDefinition | undefined;
      return task ? [task] : [];
    },
  } as LoadedTaskRegistry;
}
