import { z } from "zod";

export type ApiResponseSchema<TValue = unknown> = {
  parse(value: unknown): TValue;
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

const jsonPrimitiveSchema = z.union([z.null(), z.boolean(), z.number(), z.string()]);

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const ListPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100),
  nextCursor: z.string().min(1).nullable(),
  hasMore: z.boolean(),
  totalCount: z.number().int().min(0),
});

export const DeploymentStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const TaskRunStatusSchema = z.enum([
  "PENDING",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
]);

const isoDateTimeSchema = z.string().datetime();
const deploymentSummarySchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    status: DeploymentStatusSchema,
  })
  .nullable();

export const TaskListItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  deployment: deploymentSummarySchema,
  runsCount: z.number().int().min(0),
  schedulesCount: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const ListTasksResponseSchema = z.object({
  tasks: z.array(TaskListItemSchema),
  pagination: ListPaginationSchema,
});

export const TaskRunListItemSchema = z.object({
  id: z.string().min(1),
  status: TaskRunStatusSchema,
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  lastHeartbeatAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  task: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    environment: z.object({
      id: z.string().min(1),
      slug: z.string().min(1),
      name: z.string().min(1),
      project: z.object({
        id: z.string().min(1),
        slug: z.string().min(1),
        name: z.string().min(1),
      }),
    }),
  }),
  attemptsCount: z.number().int().min(0),
  eventsCount: z.number().int().min(0),
});

export const ListTaskRunsResponseSchema = z.object({
  taskRuns: z.array(TaskRunListItemSchema),
  pagination: ListPaginationSchema,
});

export const TriggerTaskRunResponseSchema = z.object({
  idempotentReplayed: z.boolean(),
  taskRun: z.object({
    id: z.string().min(1),
    taskId: z.string().min(1),
    taskSlug: z.string().min(1),
    taskName: z.string().min(1),
    status: TaskRunStatusSchema,
    payload: JsonValueSchema.nullable(),
    createdAt: isoDateTimeSchema,
    idempotentReplay: z.boolean(),
    traceparent: z.string().min(1),
  }),
});

export type ListTasksResponse = z.infer<typeof ListTasksResponseSchema>;
export type ListTaskRunsResponse = z.infer<typeof ListTaskRunsResponseSchema>;
export type TriggerTaskRunResponse = z.infer<typeof TriggerTaskRunResponseSchema>;

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type ApiRouteKind = "list" | "detail" | "mutation" | "stream";
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

export function parseApiResponse<TValue>(
  schema: ApiResponseSchema<TValue>,
  value: unknown,
): TValue {
  return schema.parse(value);
}
