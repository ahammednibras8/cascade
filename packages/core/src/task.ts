export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TaskRunContext<TPayload extends JsonValue = JsonValue> = {
  runId: string;
  taskId: string;
  environmentId: string;
  payload: TPayload | null;
};

export type TaskRunOutput = JsonValue | void;

export type TaskRetryConfig = {
  maxAttempts: number;
  delayMs: number;
  exponentialBackoff: boolean;
};

export type TaskDefinitionInput<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
> = {
  id: string;
  retry?: Partial<TaskRetryConfig>;
  run: (context: TaskRunContext<TPayload>) => TOutput | Promise<TOutput>;
};

export type TaskDefinition<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
> = {
  id: string;
  retry: TaskRetryConfig;
  run: (context: TaskRunContext<TPayload>) => TOutput | Promise<TOutput>;
};

export function task<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
>(definition: TaskDefinition<TPayload, TOutput>): TaskDefinition<TPayload, TOutput> {
  return {
    ...definition,
    retry: normalizeRetryConfig(definition.retry),
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
