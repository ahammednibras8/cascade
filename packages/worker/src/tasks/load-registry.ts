import { createTaskRegistry, type TaskDefinition } from "@cascade/core";

export type LoadedTaskRegistry = ReturnType<typeof createTaskRegistry>;

type TaskModule = {
  default?: unknown;
  tasks?: unknown;
};

function getTaskDefinitions(module: TaskModule): readonly TaskDefinition[] {
  const candidate = module.default ?? module.tasks;

  if (!Array.isArray(candidate)) {
    throw new Error("CASCADE_TASK_MODULE must export a default array of Cascade task definitions");
  }

  return candidate as readonly TaskDefinition[];
}

export async function loadTaskRegistry(): Promise<LoadedTaskRegistry> {
  const configuredModule = process.env.CASCADE_TASK_MODULE?.trim();

  if (!configuredModule && process.env.NODE_ENV === "production") {
    throw new Error("CASCADE_TASK_MODULE is required in production worker containers");
  }

  const moduleSpecifier = configuredModule || "./local.js";
  const taskModule = (await import(moduleSpecifier)) as TaskModule;

  return createTaskRegistry(getTaskDefinitions(taskModule));
}
