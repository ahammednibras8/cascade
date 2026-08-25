import express, { type Router } from "express";
import type { ApiKeyScope } from "@cascade/database";

const ALL_API_KEY_SCOPES: ApiKeyScope[] = [
  "TASKS_READ",
  "TASKS_TRIGGER",
  "SCHEDULES_WRITE",
  "RUNS_READ",
  "RUNS_CANCEL",
  "RUNS_REPLAY",
  "DEPLOYMENTS_WRITE",
  "API_KEYS_MANAGE",
];

export const AUTH_CONTEXT = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [...ALL_API_KEY_SCOPES],
};

export const RUN_ID = "22222222-2222-4222-8222-222222222222";
export const TASK_ID = "11111111-1111-4111-8111-111111111111";

export function createRouteTestApp(
  router: Router,
  input: {
    scopes?: ApiKeyScope[];
  } = {},
) {
  const app = express();

  app.use(express.json());

  app.use((request, _response, next) => {
    request.auth = {
      ...AUTH_CONTEXT,
      scopes: input.scopes ?? AUTH_CONTEXT.scopes,
    };
    next();
  });

  app.use("/api", router);

  return app;
}
