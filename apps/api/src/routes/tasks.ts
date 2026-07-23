import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { getIdempotencyKey } from "../lib/idempotency.js";
import { getSingleParam } from "../lib/route-params.js";
import { cancelTaskRun } from "../services/cancel-task-run.js";
import { triggerTaskRun } from "../services/trigger-task-run.js";
import { replayTaskRun } from "../services/replay-task-run.js";
import { createTaskSchedule } from "../services/create-task-schedule.js";

export const tasksRouter: ExpressRouter = Router();

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
      .json({
        taskRun: result.taskRun,
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
