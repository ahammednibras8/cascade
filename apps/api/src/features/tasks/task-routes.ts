import { ApiKeyScope } from "@cascade/database";
import { withActiveSpan } from "@cascade/telemetry";
import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { requireApiKeyScope, type ApiAuthContext } from "../../auth/api-key.js";
import {
  authenticatedRoute,
  type RouteJsonResult,
  type RouteSuccessResult,
  writeEmptyResult,
  writeErrorResult,
  writeJsonResult,
} from "../../http/route-result.js";
import { getIdempotencyKey } from "../../lib/idempotency.js";
import { getSingleParam } from "../../lib/route-params.js";
import { createTaskSchedule } from "../schedules/create-task-schedule.js";
import { deleteTaskSchedule } from "../schedules/delete-task-schedule.js";
import { getTaskSchedule } from "../schedules/get-task-schedule.js";
import { listTaskSchedules } from "../schedules/list-task-schedules.js";
import { listTasks } from "./list-tasks.js";
import { getTask } from "./get-task.js";
import { pauseTaskSchedule } from "../schedules/pause-task-schedule.js";
import { resumeTaskSchedule } from "../schedules/resume-task-schedule.js";
import { triggerTaskRun } from "../task-runs/trigger-task-run.js";
import { updateTaskSchedule } from "../schedules/update-task-schedule.js";

export const taskRoutes: ExpressRouter = Router();

taskRoutes.get(
  "/tasks",
  requireApiKeyScope(ApiKeyScope.TASKS_READ),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await listTasks({ auth, query: request.query });

    writeJsonResult(response, result, ({ tasks, pagination }) => ({
      tasks,
      pagination,
    }));
  }),
);

taskRoutes.get(
  "/tasks/:taskId",
  requireApiKeyScope(ApiKeyScope.TASKS_READ),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await getTask({
      auth,
      taskId: getSingleParam(request.params.taskId),
    });

    writeTaskResult(response, result);
  }),
);

taskRoutes.get(
  "/schedules",
  requireApiKeyScope(ApiKeyScope.TASKS_READ),
  authenticatedRoute(async ({ auth, response }) => {
    writeJsonResult(response, await listTaskSchedules({ auth }), ({ schedules }) => ({
      schedules,
    }));
  }),
);

taskRoutes.get(
  "/schedules/:scheduleId",
  requireApiKeyScope(ApiKeyScope.TASKS_READ),
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

    writeEmptyResult(response, result);
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

type TriggerTaskRunRouteResult = Awaited<ReturnType<typeof triggerTaskRun>>;

type ScheduleRouteSuccess = RouteSuccessResult & {
  schedule: unknown;
};

type TaskRouteSuccess = RouteSuccessResult & {
  task: unknown;
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

function getScheduleId(request: Request) {
  return getSingleParam(request.params.scheduleId);
}

function writeScheduleResult(response: Response, result: RouteJsonResult<ScheduleRouteSuccess>) {
  writeJsonResult(response, result, ({ schedule }) => ({ schedule }));
}

function writeTaskResult(response: Response, result: RouteJsonResult<TaskRouteSuccess>) {
  writeJsonResult(response, result, ({ task }) => ({ task }));
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
