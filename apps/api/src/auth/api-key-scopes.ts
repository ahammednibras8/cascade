import { ApiKeyScope } from "@cascade/database";

export const apiKeyScopeDefinitions = [
  {
    value: ApiKeyScope.TASKS_READ,
    label: "Read tasks",
    description: "List tasks in this environment",
  },
  {
    value: ApiKeyScope.TASKS_TRIGGER,
    label: "Trigger tasks",
    description: "Create task runs",
  },
  {
    value: ApiKeyScope.SCHEDULES_WRITE,
    label: "Manage schedules",
    description: "Create task schedules",
  },
  {
    value: ApiKeyScope.RUNS_READ,
    label: "Read runs",
    description: "View runs, attempts, and events",
  },
  {
    value: ApiKeyScope.RUNS_CANCEL,
    label: "Cancel runs",
    description: "Cancel pending or executing runs",
  },
  {
    value: ApiKeyScope.RUNS_REPLAY,
    label: "Replay runs",
    description: "Replay completed, failed or canceled runs",
  },
  {
    value: ApiKeyScope.DEPLOYMENTS_WRITE,
    label: "Create deployments",
    description: "Create a deployment and register its tasks",
  },
  {
    value: ApiKeyScope.API_KEYS_MANAGE,
    label: "Manage API keys",
    description: "Create, revoke, rotate, and list API keys.",
  },
] as const;

const allApiKeyScopes = new Set(apiKeyScopeDefinitions.map(({ value }) => value));

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === "string" && allApiKeyScopes.has(value as ApiKeyScope);
}
