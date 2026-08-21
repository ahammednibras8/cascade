import { Router, type Router as ExpressRouter } from "express";
import { authenticatedRoute, writeErrorResult, writeJsonResult } from "../../http/route-result.js";
import { getSingleParam } from "../../lib/route-params.js";
import { cancelTaskRun } from "./cancel-task-run.js";
import { getTaskRun } from "./get-task-run.js";
import { listTaskRunEvents } from "./list-task-run-events.js";
import { replayTaskRun } from "./replay-task-run.js";
import { ApiKeyScope } from "@cascade/database";
import { requireApiKeyScope } from "../../auth/api-key.js";
import { streamTaskRunEvents } from "../../realtime/run-event-stream.js";
import { streamEnvironmentRuns } from "../../realtime/environment-runs-stream.js";
import { listTaskRuns } from "./list-task-runs.js";

export const taskRunRoutes: ExpressRouter = Router();

taskRunRoutes.get(
  "/runs/stream",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  authenticatedRoute(async ({ auth, request, response }) => {
    await streamEnvironmentRuns({
      request,
      response,
      auth,
    });
  }),
);

taskRunRoutes.get(
  "/runs/:runId",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await getTaskRun({
      auth,
      runId: getSingleParam(request.params["runId"]),
    });

    writeJsonResult(response, result, ({ taskRun }) => ({ taskRun }));
  }),
);

taskRunRoutes.get(
  "/runs/:runId/events",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  authenticatedRoute(async ({ auth, request, response }) => {
    const afterQuery = request.query["after"];

    const afterEventId =
      typeof afterQuery === "string"
        ? afterQuery
        : Array.isArray(afterQuery) && typeof afterQuery[0] === "string"
          ? afterQuery[0]
          : undefined;

    const result = await listTaskRunEvents({
      auth,
      runId: getSingleParam(request.params["runId"]),
      ...(afterEventId ? { afterEventId } : {}),
    });

    writeJsonResult(response, result, ({ events, nextCursor, hasMore }) => ({
      events,
      nextCursor,
      hasMore,
    }));
  }),
);

taskRunRoutes.get(
  "/runs/:runId/events/stream",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await streamTaskRunEvents({
      request,
      response,
      auth,
      runId: getSingleParam(request.params["runId"]),
    });

    if (!result.ok) {
      writeErrorResult(response, result);
    }
  }),
);

taskRunRoutes.get(
  "/runs",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await listTaskRuns({
      auth,
      query: request.query,
    });

    writeJsonResult(response, result, ({ taskRuns, pagination }) => ({
      taskRuns,
      pagination,
    }));
  }),
);

taskRunRoutes.post(
  "/runs/:runId/cancel",
  requireApiKeyScope(ApiKeyScope.RUNS_CANCEL),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await cancelTaskRun({
      auth,
      runId: getSingleParam(request.params["runId"]),
    });

    writeJsonResult(response, result, ({ taskRun }) => ({ taskRun }));
  }),
);

taskRunRoutes.post(
  "/runs/:runId/replay",
  requireApiKeyScope(ApiKeyScope.RUNS_REPLAY),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await replayTaskRun({
      auth,
      runId: getSingleParam(request.params["runId"]),
    });

    writeJsonResult(response, result, ({ taskRun }) => ({ taskRun }));
  }),
);
