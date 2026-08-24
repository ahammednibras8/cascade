import { ApiErrorResponseSchema, type ApiResponseSchema } from "./common.js";
import {
  DeactivateDeploymentResponseSchema,
  DeploymentDetailResponseSchema,
  ListDeploymentsResponseSchema,
  RollbackDeploymentResponseSchema,
} from "./deployments.js";
import {
  ListTaskRunsResponseSchema,
  TaskRunDetailResponseSchema,
  TaskRunEventsResponseSchema,
  TriggerTaskRunResponseSchema,
} from "./task-runs.js";
import { ListTasksResponseSchema, TaskDetailResponseSchema } from "./tasks.js";
import { ListTaskSchedulesResponseSchema, TaskScheduleDetailResponseSchema } from "./schedules.js";
import { ListApiKeysResponseSchema } from "./api-keys.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type ApiRouteKind = "list" | "cursor-list" | "detail" | "mutation" | "stream";
export type ApiRetrySafety = "safe" | "idempotency-key" | "unsafe";
export type ApiResponseStatus = 200 | 202 | 400 | 401 | 403 | 404 | 409 | 500;

export type ApiRouteContract = {
  method: HttpMethod;
  path: string;
  kind: ApiRouteKind;
  retrySafety: ApiRetrySafety;
  responses: Partial<Record<ApiResponseStatus, ApiResponseSchema>>;
  errorCodes: readonly string[];
  pagination?: "required";
  idempotencyHeader?: "Idempotency-Key";
};

export const apiContracts = {
  listTasks: {
    method: "GET",
    path: "/api/tasks",
    kind: "list",
    retrySafety: "safe",
    pagination: "required",
    responses: {
      200: ListTasksResponseSchema,
      400: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_LIST_QUERY"],
  },
  getTask: {
    method: "GET",
    path: "/api/tasks/:taskId",
    kind: "detail",
    retrySafety: "safe",
    responses: {
      200: TaskDetailResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_TASK_ID", "TASK_NOT_FOUND"],
  },
  listTaskSchedules: {
    method: "GET",
    path: "/api/schedules",
    kind: "list",
    retrySafety: "safe",
    pagination: "required",
    responses: {
      200: ListTaskSchedulesResponseSchema,
      400: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_LIST_QUERY"],
  },
  getTaskSchedule: {
    method: "GET",
    path: "/api/schedules/:scheduleId",
    kind: "detail",
    retrySafety: "safe",
    responses: {
      200: TaskScheduleDetailResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_SCHEDULE_ID", "SCHEDULE_NOT_FOUND"],
  },
  listApiKeys: {
    method: "GET",
    path: "/api/api-keys",
    kind: "list",
    retrySafety: "safe",
    pagination: "required",
    responses: {
      200: ListApiKeysResponseSchema,
      400: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_LIST_QUERY"],
  },
  listTaskRuns: {
    method: "GET",
    path: "/api/runs",
    kind: "list",
    retrySafety: "safe",
    pagination: "required",
    responses: {
      200: ListTaskRunsResponseSchema,
      400: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_LIST_QUERY"],
  },
  getTaskRun: {
    method: "GET",
    path: "/api/runs/:runId",
    kind: "detail",
    retrySafety: "safe",
    responses: {
      200: TaskRunDetailResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_RUN_ID", "RUN_NOT_FOUND"],
  },
  listTaskRunEvents: {
    method: "GET",
    path: "/api/runs/:runId/events",
    kind: "cursor-list",
    retrySafety: "safe",
    responses: {
      200: TaskRunEventsResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_RUN_ID", "INVALID_EVENT_CURSOR", "RUN_NOT_FOUND"],
  },
  listDeployments: {
    method: "GET",
    path: "/api/deployments",
    kind: "list",
    retrySafety: "safe",
    pagination: "required",
    responses: {
      200: ListDeploymentsResponseSchema,
      400: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_LIST_QUERY"],
  },
  getDeployment: {
    method: "GET",
    path: "/api/deployments/:deploymentId",
    kind: "detail",
    retrySafety: "safe",
    responses: {
      200: DeploymentDetailResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
    },
    errorCodes: ["INVALID_DEPLOYMENT_ID", "DEPLOYMENT_NOT_FOUND"],
  },
  deactivateDeployment: {
    method: "POST",
    path: "/api/deployments/:deploymentId/deactivate",
    kind: "mutation",
    retrySafety: "unsafe",
    responses: {
      200: DeactivateDeploymentResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
      409: ApiErrorResponseSchema,
    },
    errorCodes: [
      "INVALID_DEPLOYMENT_ID",
      "DEPLOYMENT_NOT_FOUND",
      "DEPLOYMENT_ALREADY_INACTIVE",
      "DEPLOYMENT_NOT_DEACTIVATABLE",
      "DEPLOYMENT_STATE_CHANGED",
    ],
  },
  rollbackDeployment: {
    method: "POST",
    path: "/api/deployments/:deploymentId/rollback",
    kind: "mutation",
    retrySafety: "unsafe",
    responses: {
      200: RollbackDeploymentResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
      409: ApiErrorResponseSchema,
    },
    errorCodes: [
      "INVALID_DEPLOYMENT_ID",
      "DEPLOYMENT_NOT_FOUND",
      "DEPLOYMENT_ALREADY_ACTIVE",
      "DEPLOYMENT_NOT_ROLLBACKABLE",
      "DEPLOYMENT_MANIFEST_MISSING",
      "DEPLOYMENT_STATE_CHANGED",
    ],
  },
  triggerTaskRunById: {
    method: "POST",
    path: "/api/tasks/:taskId/trigger",
    kind: "mutation",
    retrySafety: "idempotency-key",
    idempotencyHeader: "Idempotency-Key",
    responses: {
      200: TriggerTaskRunResponseSchema,
      202: TriggerTaskRunResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
      409: ApiErrorResponseSchema,
    },
    errorCodes: [
      "INVALID_TASK_ID",
      "INVALID_IDEMPOTENCY_KEY",
      "INVALID_DELAY_UNTIL",
      "TASK_NOT_FOUND",
      "TASK_EXECUTION_CONFIG_MISSING",
      "IDEMPOTENCY_CONFLICT",
    ],
  },
  triggerTaskRunBySlug: {
    method: "POST",
    path: "/api/tasks/slug/:taskSlug/trigger",
    kind: "mutation",
    retrySafety: "idempotency-key",
    idempotencyHeader: "Idempotency-Key",
    responses: {
      200: TriggerTaskRunResponseSchema,
      202: TriggerTaskRunResponseSchema,
      400: ApiErrorResponseSchema,
      404: ApiErrorResponseSchema,
      409: ApiErrorResponseSchema,
    },
    errorCodes: [
      "INVALID_TASK_SLUG",
      "INVALID_TASK_REFERENCE",
      "INVALID_IDEMPOTENCY_KEY",
      "INVALID_DELAY_UNTIL",
      "TASK_NOT_FOUND",
      "TASK_EXECUTION_CONFIG_MISSING",
      "IDEMPOTENCY_CONFLICT",
    ],
  },
} as const satisfies Record<string, ApiRouteContract>;
