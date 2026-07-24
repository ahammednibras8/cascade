export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TaskLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type TaskLogger = {
  debug: (message: string, data?: JsonValue) => Promise<void>;
  info: (message: string, data?: JsonValue) => Promise<void>;
  warn: (message: string, data?: JsonValue) => Promise<void>;
  error: (message: string, data?: JsonValue) => Promise<void>;
};

export type TaskRunContext<TPayload extends JsonValue = JsonValue> = {
  runId: string;
  taskId: string;
  environmentId: string;
  payload: TPayload | null;
  logger: TaskLogger;
};

export type TaskRunOutput = JsonValue | void;

export type TaskRetryConfig = {
  maxAttempts: number;
  delayMs: number;
  exponentialBackoff: boolean;
};

export type TaskQueueConfig = {
  name: string;
  concurrencyLimit: number | null;
};

export type TaskDefinitionInput<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
> = {
  id: string;
  retry?: Partial<TaskRetryConfig>;
  queue?: Partial<TaskQueueConfig>;
  run: (context: TaskRunContext<TPayload>) => TOutput | Promise<TOutput>;
};

export type TaskDefinition<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
> = {
  id: string;
  retry: TaskRetryConfig;
  queue: TaskQueueConfig;
  run: (context: TaskRunContext<TPayload>) => TOutput | Promise<TOutput>;
};

export function task<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
>(definition: TaskDefinitionInput<TPayload, TOutput>): TaskDefinition<TPayload, TOutput> {
  return {
    ...definition,
    retry: normalizeRetryConfig(definition.retry),
    queue: normalizeQueueConfig(definition.id, definition.queue),
  };
}

export function createTaskRegistry(tasks: readonly TaskDefinition[]) {
  const tasksById = new Map<string, TaskDefinition>();

  for (const registeredTask of tasks) {
    if (tasksById.has(registeredTask.id)) {
      throw new Error(`Duplicate task id: ${registeredTask.id}`);
    }

    tasksById.set(registeredTask.id, registeredTask);
  }

  return {
    get(id: string) {
      return tasksById.get(id);
    },

    has(id: string) {
      return tasksById.has(id);
    },

    list() {
      return [...tasksById.values()];
    },
  };
}

function normalizeRetryConfig(retry?: Partial<TaskRetryConfig>): TaskRetryConfig {
  const maxAttempts = retry?.maxAttempts ?? 1;
  const delayMs = retry?.delayMs ?? 0;
  const exponentialBackoff = retry?.exponentialBackoff ?? false;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("retry.maxAttempts must be an integer greater than or equal to 1");
  }

  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error("retry.delayMs must be an integer greater than or equal to 0");
  }

  return {
    maxAttempts,
    delayMs,
    exponentialBackoff,
  };
}

function normalizeQueueConfig(taskId: string, queue?: Partial<TaskQueueConfig>): TaskQueueConfig {
  const name = queue?.name ?? taskId;
  const concurrencyLimit = queue?.concurrencyLimit ?? null;

  if (!name.trim()) {
    throw new Error("queue.name must not be empty");
  }

  if (concurrencyLimit !== null && (!Number.isInteger(concurrencyLimit) || concurrencyLimit < 1)) {
    throw new Error("queue.concurrencyLimit must be an integer greater than or equal to 1");
  }

  return {
    name,
    concurrencyLimit,
  };
}
