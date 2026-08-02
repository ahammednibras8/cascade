import { Router, type Response, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { getIdempotencyKey } from "../lib/idempotency.js";
import { getSingleParam } from "../lib/route-params.js";
import { createTaskSchedule } from "../services/create-task-schedule.js";
import { listTasks } from "../services/list-tasks.js";
import { triggerTaskRun } from "../services/trigger-task-run.js";
import { getAuthOrRespond } from "./route-auth.js";
import { withActiveSpan } from "@cascade/telemetry";

export const taskRoutes: ExpressRouter = Router();

taskRoutes.get(
  "/tasks",
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await listTasks({ auth });

    response.status(result.status).json({
      tasks: result.tasks,
    });
  }),
);

taskRoutes.post(
  "/tasks/slug/:taskSlug/trigger",
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const taskSlug = getSingleParam(request.params.taskSlug);

    const result = await withActiveSpan(
      {
        name: "cascade.task.run.trigger",
        attributes: {
          "cascade.environment.id": auth.environmentId,
          "cascade.task.slug": taskSlug ?? "unknown",
        },
      },
      async (traceContext) =>
        triggerTaskRun({
          auth,
          taskSlug,
          body: request.body,
          idempotencyKey: getIdempotencyKey(request),
          traceparent: request.get("traceparent")?.trim(),
          ...(traceContext ? { trace: traceContext } : {}),
        }),
    );

    writeTriggerTaskRunResponse(result, response);
  }),
);

taskRoutes.post(
  "/tasks/:taskId/trigger",
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const taskId = getSingleParam(request.params.taskId);

    const result = await withActiveSpan(
      {
        name: "cascade.task.run.trigger",
        attributes: {
          "cascade.environment.id": auth.environmentId,
          "cascade.task.id": taskId ?? "unknown",
        },
      },
      async (traceContext) =>
        triggerTaskRun({
          auth,
          taskId,
          body: request.body,
          idempotencyKey: getIdempotencyKey(request),
          traceparent: request.get("traceparent")?.trim(),
          ...(traceContext ? { trace: traceContext } : {}),
        }),
    );

    writeTriggerTaskRunResponse(result, response);
  }),
);

taskRoutes.post(
  "/tasks/:taskId/schedules",
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
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

type TriggerTaskRunRouteResult = Awaited<ReturnType<typeof triggerTaskRun>>;

function writeTriggerTaskRunResponse(result: TriggerTaskRunRouteResult, response: Response) {
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
}
