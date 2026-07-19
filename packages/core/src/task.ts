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

export type TaskDefinition<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
> = {
  id: string;
  run: (context: TaskRunContext<TPayload>) => TOutput | Promise<TOutput>;
};

export function task<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
>(definition: TaskDefinition<TPayload, TOutput>) {
  return definition;
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
