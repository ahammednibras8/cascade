import { Router, type Router as ExpressRouter } from "express";
import { prisma } from "@cascade/database";
import { asyncHandler } from "../http/async-handler.js";
import { getSingleParam } from "../lib/route-params.js";
import { cancelTaskRun } from "../services/cancel-task-run.js";
import { getTaskRun } from "../services/get-task-run.js";
import { listTaskRunEvents } from "../services/list-task-run-events.js";
import { replayTaskRun } from "../services/replay-task-run.js";
import { getAuthOrRespond } from "./route-auth.js";
import { ApiKeyScope } from "@cascade/database";
import { requireApiKeyScope } from "../auth/api-key.js";

export const taskRunRoutes: ExpressRouter = Router();

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

    const result = await listTaskRunEvents({
      auth,
      runId: getSingleParam(request.params.runId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.json({
      events: result.events,
    });
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

    const runs = await prisma.taskRun.findMany({
      where: {
        task: {
          environmentId: auth.environmentId,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        lastHeartbeatAt: true,
        completedAt: true,
        task: {
          select: {
            id: true,
            slug: true,
            name: true,
            environment: {
              select: {
                id: true,
                slug: true,
                name: true,
                project: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            attempts: true,
            events: true,
          },
        },
      },
    });

    response.json({
      taskRuns: runs.map((run) => ({
        id: run.id,
        status: run.status,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        task: run.task,
        attemptsCount: run._count.attempts,
        eventsCount: run._count.events,
      })),
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
