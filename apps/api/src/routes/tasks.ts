import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { getIdempotencyKey } from "../lib/idempotency.js";
import { getSingleParam } from "../lib/route-params.js";
import { cancelTaskRun } from "../services/cancel-task-run.js";
import { triggerTaskRun } from "../services/trigger-task-run.js";
import { replayTaskRun } from "../services/replay-task-run.js";
import { createTaskSchedule } from "../services/create-task-schedule.js";
import { createDeployment } from "../services/create-deployment.js";
import { getTaskRun } from "../services/get-task-run.js";
import { listTaskRunEvents } from "../services/list-task-run-events.js";
import { prisma } from "@cascade/database";

export const tasksRouter: ExpressRouter = Router();

tasksRouter.post(
  "/deployments",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
      return;
    }

    const result = await createDeployment({
      auth,
      body: request.body,
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).json({
      deployment: result.deployment,
    });
  }),
);

tasksRouter.post(
  "/tasks/slug/:taskSlug/trigger",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
      return;
    }

    const result = await triggerTaskRun({
      auth,
      taskSlug: getSingleParam(request.params.taskSlug),
      body: request.body,
      idempotencyKey: getIdempotencyKey(request),
      traceparent: request.get("traceparent")?.trim(),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response
      .status(result.status)
      .set("Idempotent-Replayed", result.idempotentReplayed ? "true" : "false")
      .set("traceparent", result.taskRun.traceparent)
      .json({ taskRun: result.taskRun });
  }),
);

tasksRouter.post(
  "/tasks/:taskId/trigger",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
      return;
    }

    const result = await triggerTaskRun({
      auth,
      taskId: getSingleParam(request.params.taskId),
      body: request.body,
      idempotencyKey: getIdempotencyKey(request),
      traceparent: request.get("traceparent")?.trim(),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response
      .status(result.status)
      .set("Idempotent-Replayed", result.idempotentReplayed ? "true" : "false")
      .set("traceparent", result.taskRun.traceparent)
      .json({
        taskRun: result.taskRun,
      });
  }),
);

tasksRouter.get(
  "/runs/:runId",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
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

tasksRouter.get(
  "/runs/:runId/events",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
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

tasksRouter.get(
  "/runs",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
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

tasksRouter.post(
  "/runs/:runId/cancel",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
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

tasksRouter.post(
  "/runs/:runId/replay",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
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

tasksRouter.post(
  "/tasks/:taskId/schedules",
  asyncHandler(async (request, response) => {
    const auth = request.auth;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
      return;
    }

    const result = await createTaskSchedule({
      auth,
      taskId: getSingleParam(request.params.taskId),
      body: request.body,
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).json({
      schedule: result.schedule,
    });
  }),
);
