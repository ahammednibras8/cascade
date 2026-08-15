import { ApiKeyScope } from "@cascade/database";
import { withActiveSpan } from "@cascade/telemetry";
import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { requireApiKeyScope, type ApiAuthContext } from "../auth/api-key.js";
import { asyncHandler } from "../http/async-handler.js";
import { getIdempotencyKey } from "../lib/idempotency.js";
import { getSingleParam } from "../lib/route-params.js";
import { createTaskSchedule } from "../services/create-task-schedule.js";
import { deleteTaskSchedule } from "../services/delete-task-schedule.js";
import { getTaskSchedule } from "../services/get-task-schedule.js";
import { listTaskSchedules } from "../services/list-task-schedules.js";
import { listTasks } from "../services/list-tasks.js";
import { pauseTaskSchedule } from "../services/pause-task-schedule.js";
import { resumeTaskSchedule } from "../services/resume-task-schedule.js";
import { triggerTaskRun } from "../services/trigger-task-run.js";
import { updateTaskSchedule } from "../services/update-task-schedule.js";
import { getAuthOrRespond } from "./route-auth.js";

export const taskRoutes: ExpressRouter = Router();

taskRoutes.get(
  "/tasks",
  requireApiKeyScope(ApiKeyScope.TASKS_READ),
  authenticatedRoute(async ({ auth, response }) => {
    writeJsonResult(response, await listTasks({ auth }), ({ tasks }) => ({ tasks }));
  }),
);

taskRoutes.get(
  "/schedules",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  authenticatedRoute(async ({ auth, response }) => {
    writeJsonResult(response, await listTaskSchedules({ auth }), ({ schedules }) => ({
      schedules,
    }));
  }),
);

taskRoutes.get(
  "/schedules/:scheduleId",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await getTaskSchedule({
      auth,
      scheduleId: getScheduleId(request),
    });

    writeScheduleResult(response, result);
  }),
);

taskRoutes.post(
  "/schedules/:scheduleId/pause",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await pauseTaskSchedule({
      auth,
      scheduleId: getScheduleId(request),
    });

    writeScheduleResult(response, result);
  }),
);

taskRoutes.post(
  "/schedules/:scheduleId/resume",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await resumeTaskSchedule({
      auth,
      scheduleId: getScheduleId(request),
    });

    writeScheduleResult(response, result);
  }),
);

taskRoutes.delete(
  "/schedules/:scheduleId",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await deleteTaskSchedule({
      auth,
      scheduleId: getScheduleId(request),
    });

    writeDeleteResult(response, result);
  }),
);

taskRoutes.put(
  "/schedules/:scheduleId",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await updateTaskSchedule({
      auth,
      scheduleId: getScheduleId(request),
      body: request.body,
    });

    writeScheduleResult(response, result);
  }),
);

taskRoutes.post(
  "/tasks/slug/:taskSlug/trigger",
  requireApiKeyScope(ApiKeyScope.TASKS_TRIGGER),
  authenticatedRoute(async ({ auth, request, response }) => {
    await triggerTaskFromRoute({
      auth,
      request,
      response,
      taskReference: {
        kind: "slug",
        value: getSingleParam(request.params.taskSlug),
      },
    });
  }),
);

taskRoutes.post(
  "/tasks/:taskId/trigger",
  requireApiKeyScope(ApiKeyScope.TASKS_TRIGGER),
  authenticatedRoute(async ({ auth, request, response }) => {
    await triggerTaskFromRoute({
      auth,
      request,
      response,
      taskReference: {
        kind: "id",
        value: getSingleParam(request.params.taskId),
      },
    });
  }),
);

taskRoutes.post(
  "/tasks/:taskId/schedules",
  requireApiKeyScope(ApiKeyScope.SCHEDULES_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await createTaskSchedule({
      auth,
      taskId: getSingleParam(request.params.taskId),
      body: request.body,
    });

    writeScheduleResult(response, result);
  }),
);

type AuthenticatedRouteInput = {
  auth: ApiAuthContext;
  request: Request;
  response: Response;
};

type RouteErrorResult = {
  ok: false;
  status: number;
  error: unknown;
};

type RouteSuccessResult = {
  ok: true;
  status: number;
};

type RouteJsonResult<TSuccess extends RouteSuccessResult> = TSuccess | RouteErrorResult;
type DeleteScheduleResult = Awaited<ReturnType<typeof deleteTaskSchedule>>;
type TriggerTaskRunRouteResult = Awaited<ReturnType<typeof triggerTaskRun>>;

type ScheduleRouteSuccess = RouteSuccessResult & {
  schedule: unknown;
};

type TaskReference =
  | {
      kind: "id";
      value: string | undefined;
    }
  | {
      kind: "slug";
      value: string | undefined;
    };

function authenticatedRoute(handler: (input: AuthenticatedRouteInput) => Promise<void>) {
  return asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    await handler({ auth, request, response });
  });
}

function getScheduleId(request: Request) {
  return getSingleParam(request.params.scheduleId);
}

function writeErrorResult(response: Response, result: RouteErrorResult) {
  response.status(result.status).json({
    error: result.error,
  });
}

function writeJsonResult<TSuccess extends RouteSuccessResult>(
  response: Response,
  result: RouteJsonResult<TSuccess>,
  body: (result: TSuccess) => Record<string, unknown>,
) {
  if (!result.ok) {
    writeErrorResult(response, result);
    return;
  }

  response.status(result.status).json(body(result));
}

function writeScheduleResult(response: Response, result: RouteJsonResult<ScheduleRouteSuccess>) {
  writeJsonResult(response, result, ({ schedule }) => ({ schedule }));
}

function writeDeleteResult(response: Response, result: DeleteScheduleResult) {
  if (!result.ok) {
    writeErrorResult(response, result);
    return;
  }

  response.status(result.status).send();
}

async function triggerTaskFromRoute(input: {
  auth: ApiAuthContext;
  request: Request;
  response: Response;
  taskReference: TaskReference;
}) {
  const { auth, request, response, taskReference } = input;

  const result = await withActiveSpan(
    {
      name: "cascade.task.run.trigger",
      attributes: {
        "cascade.environment.id": auth.environmentId,
        [getTaskReferenceAttribute(taskReference)]: taskReference.value ?? "unknown",
      },
    },
    async (traceContext) =>
      triggerTaskRun({
        auth,
        body: request.body,
        idempotencyKey: getIdempotencyKey(request),
        traceparent: request.get("traceparent")?.trim(),
        ...(taskReference.kind === "id"
          ? { taskId: taskReference.value }
          : { taskSlug: taskReference.value }),
        ...(traceContext ? { trace: traceContext } : {}),
      }),
  );

  writeTriggerTaskRunResult(response, result);
}

function getTaskReferenceAttribute(taskReference: TaskReference) {
  return taskReference.kind === "id" ? "cascade.task.id" : "cascade.task.slug";
}

function writeTriggerTaskRunResult(response: Response, result: TriggerTaskRunRouteResult) {
  if (!result.ok) {
    writeErrorResult(response, result);
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
