import { Router, type Response, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { getIdempotencyKey } from "../lib/idempotency.js";
import { getSingleParam } from "../lib/route-params.js";
import { createTaskSchedule } from "../services/create-task-schedule.js";
import { listTasks } from "../services/list-tasks.js";
import { triggerTaskRun } from "../services/trigger-task-run.js";
import { getAuthOrRespond } from "./route-auth.js";
import { withActiveSpan } from "@cascade/telemetry";
import { ApiKeyScope } from "@cascade/database";
import { requireApiKeyScope } from "../auth/api-key.js";
import { listTaskSchedules } from "../services/list-task-schedules.js";
import { pauseTaskSchedule } from "../services/pause-task-schedule.js";
import { resumeTaskSchedule } from "../services/resume-task-schedule.js";
import { deleteTaskSchedule } from "../services/delete-task-schedule.js";

export const taskRoutes: ExpressRouter = Router();

taskRoutes.get(
  "/tasks",
  requireApiKeyScope(ApiKeyScope.TASKS_READ),
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

taskRoutes.get(
  "/schedules",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await listTaskSchedules({ auth });

    response.status(result.status).json({
      schedules: result.schedules,
    });
  }),
);

taskRoutes.post(
  "/schedules/:scheduleId/pause",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await pauseTaskSchedule({
      auth,
      scheduleId: getSingleParam(request.params.scheduleId),
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

taskRoutes.post(
  "/schedules/:scheduleId/resume",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await resumeTaskSchedule({
      auth,
      scheduleId: getSingleParam(request.params.scheduleId),
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

taskRoutes.delete(
  "/schedules/:scheduleId",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await deleteTaskSchedule({
      auth,
      scheduleId: getSingleParam(request.params.scheduleId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(204).send();
  }),
);

taskRoutes.post(
  "/tasks/slug/:taskSlug/trigger",
  requireApiKeyScope(ApiKeyScope.TASKS_TRIGGER),
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
  requireApiKeyScope(ApiKeyScope.TASKS_TRIGGER),
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
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
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
