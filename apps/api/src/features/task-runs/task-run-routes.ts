import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../../http/async-handler.js";
import { getSingleParam } from "../../lib/route-params.js";
import { cancelTaskRun } from "./cancel-task-run.js";
import { getTaskRun } from "./get-task-run.js";
import { listTaskRunEvents } from "./list-task-run-events.js";
import { replayTaskRun } from "./replay-task-run.js";
import { getAuthOrRespond } from "../../routes/route-auth.js";
import { ApiKeyScope } from "@cascade/database";
import { requireApiKeyScope } from "../../auth/api-key.js";
import { streamTaskRunEvents } from "../../realtime/run-event-stream.js";
import { streamEnvironmentRuns } from "../../realtime/environment-runs-stream.js";
import { listTaskRuns } from "./list-task-runs.js";

export const taskRunRoutes: ExpressRouter = Router();

taskRunRoutes.get(
  "/runs/stream",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

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
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await getTaskRun({
      auth,
      runId: getSingleParam(request.params.runId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(200).json({
      taskRun: result.taskRun,
    });
  }),
);

taskRunRoutes.get(
  "/runs/:runId/events",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const afterQuery = request.query.after;

    const afterEventId =
      typeof afterQuery === "string"
        ? afterQuery
        : Array.isArray(afterQuery) && typeof afterQuery[0] === "string"
          ? afterQuery[0]
          : undefined;

    const result = await listTaskRunEvents({
      auth,
      runId: getSingleParam(request.params.runId),
      ...(afterEventId ? { afterEventId } : {}),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.json({
      events: result.events,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  }),
);

taskRunRoutes.get(
  "/runs/:runId/events/stream",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await streamTaskRunEvents({
      request,
      response,
      auth,
      runId: getSingleParam(request.params.runId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
    }
  }),
);

taskRunRoutes.get(
  "/runs",
  requireApiKeyScope(ApiKeyScope.RUNS_READ),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await listTaskRuns({
      auth,
      query: request.query,
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.json({
      taskRuns: result.taskRuns,
      pagination: result.pagination,
    });
  }),
);

taskRunRoutes.post(
  "/runs/:runId/cancel",
  requireApiKeyScope(ApiKeyScope.RUNS_CANCEL),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await cancelTaskRun({
      auth,
      runId: getSingleParam(request.params.runId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).json({
      taskRun: result.taskRun,
    });
  }),
);

taskRunRoutes.post(
  "/runs/:runId/replay",
  requireApiKeyScope(ApiKeyScope.RUNS_REPLAY),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await replayTaskRun({
      auth,
      runId: getSingleParam(request.params.runId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).json({
      taskRun: result.taskRun,
    });
  }),
);
