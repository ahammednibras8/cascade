import { parseTaskExecutionConfig, type TaskExecutionConfig } from "@cascade/core";
import { failure } from "../../lib/service-result.js";

type DeploymentTaskInput = {
  slug: string;
  name: string;
  description: string | null;
  executionConfig: TaskExecutionConfig;
};

const MAX_DEPLOYMENT_VERSION_LENGTH = 120;
const MAX_DEPLOYMENT_IMAGE_LENGTH = 512;
const MAX_DEPLOYMENT_TASKS = 100;
const MAX_TASK_SLUG_LENGTH = 120;
const MAX_TASK_NAME_LENGTH = 200;
const MAX_TASK_DESCRIPTION_LENGTH = 4_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidDeploymentBody(code: string, message: string) {
  return failure(400, code, message);
}

function getTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

function parseTaskDescription(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || value.length > MAX_TASK_DESCRIPTION_LENGTH) {
    return invalidDeploymentBody(
      "INVALID_TASK_DESCRIPTION",
      `task.description must be a string with at most ${MAX_TASK_DESCRIPTION_LENGTH} characters`,
    );
  }

  return value;
}

function parseTaskName(value: unknown, slug: string) {
  if (value === undefined) {
    return slug;
  }

  const name = getTrimmedString(value);

  if (!name || name.length > MAX_TASK_NAME_LENGTH) {
    return invalidDeploymentBody(
      "INVALID_TASK_NAME",
      `task.name must be a non-empty string with at most ${MAX_TASK_NAME_LENGTH} characters`,
    );
  }

  return name;
}

function parseDeploymentTask(task: Record<string, unknown>) {
  const slug = getTrimmedString(task["slug"]);

  if (!slug || slug.length > MAX_TASK_SLUG_LENGTH) {
    return invalidDeploymentBody(
      "INVALID_TASK",
      `task.slug must be a non-empty string with at most ${MAX_TASK_SLUG_LENGTH} characters`,
    );
  }

  const name = parseTaskName(task["name"], slug);

  if (typeof name !== "string") {
    return name;
  }

  const description = parseTaskDescription(task["description"]);

  if (description !== null && typeof description !== "string") {
    return description;
  }

  const executionConfig = parseTaskExecutionConfig(task["executionConfig"]);

  if (!executionConfig) {
    return invalidDeploymentBody(
      "INVALID_TASK_EXECUTION_CONFIG",
      "task.executionConfig must contain schemaVersion, timeoutMs, retry, and queue settings",
    );
  }

  return {
    ok: true as const,
    task: {
      slug,
      name,
      description,
      executionConfig,
    } satisfies DeploymentTaskInput,
  };
}

function parseDeploymentTasks(tasks: unknown) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return invalidDeploymentBody("INVALID_TASKS", "tasks must be a non-empty array");
  }

  if (tasks.length > MAX_DEPLOYMENT_TASKS) {
    return invalidDeploymentBody(
      "INVALID_TASKS",
      `tasks must contain at most ${MAX_DEPLOYMENT_TASKS} items`,
    );
  }

  const parsedTasks: DeploymentTaskInput[] = [];
  const taskSlugs = new Set<string>();

  for (const task of tasks) {
    if (!isRecord(task)) {
      return invalidDeploymentBody("INVALID_TASK", "Each task must be an object");
    }

    const parsedTask = parseDeploymentTask(task);

    if (!parsedTask.ok) {
      return parsedTask;
    }

    if (taskSlugs.has(parsedTask.task.slug)) {
      return invalidDeploymentBody(
        "DUPLICATE_TASK_SLUG",
        "tasks must not contain duplicate task.slug values",
      );
    }

    taskSlugs.add(parsedTask.task.slug);
    parsedTasks.push(parsedTask.task);
  }

  return {
    ok: true as const,
    tasks: parsedTasks,
  };
}

export function parseDeploymentBody(body: unknown) {
  if (!isRecord(body)) {
    return invalidDeploymentBody("INVALID_BODY", "Body must be an object");
  }

  const version = getTrimmedString(body["version"]);

  if (!version || version.length > MAX_DEPLOYMENT_VERSION_LENGTH) {
    return invalidDeploymentBody(
      "INVALID_VERSION",
      `version must be a non-empty string with at most ${MAX_DEPLOYMENT_VERSION_LENGTH} characters`,
    );
  }

  const image = getTrimmedString(body["image"]);

  if (!image || image.length > MAX_DEPLOYMENT_IMAGE_LENGTH || /\s/.test(image)) {
    return invalidDeploymentBody(
      "INVALID_IMAGE",
      `image must be a whitespace-free string with at most ${MAX_DEPLOYMENT_IMAGE_LENGTH} characters`,
    );
  }

  const tasks = parseDeploymentTasks(body["tasks"]);

  if (!tasks.ok) {
    return tasks;
  }

  return {
    ok: true as const,
    deployment: {
      version,
      image,
      tasks: tasks.tasks,
    },
  };
}
