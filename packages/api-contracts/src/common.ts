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

export const DeploymentStatusSchema = z.enum(["ACTIVE", "INACTIVE", "FAILED"]);
export const DeploymentRuntimeStatusSchema = z.enum([
  "PENDING",
  "STARTING",
  "RUNNING",
  "DRAINING",
  "STOPPED",
  "FAILED",
]);
export const TaskRunStatusSchema = z.enum([
  "PENDING",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
]);

export const TaskAttemptStatusSchema = z.enum(["EXECUTING", "COMPLETED", "FAILED", "CANCELED"]);

export const TaskEventLevelSchema = z.enum(["DEBUG", "INFO", "WARN", "ERROR"]);

export const IsoDateTimeStringSchema = z.string().datetime();

export const TaskExecutionConfigSchema = z.object({
  schemaVersion: z.number().int().min(1),
  timeoutMs: z.number().int().min(0).nullable(),
  retry: z.object({
    maxAttempts: z.number().int().min(1),
    delayMs: z.number().int().min(0),
    exponentialBackoff: z.boolean(),
  }),
  queue: z.object({
    name: z.string().min(1),
    concurrencyLimit: z.number().int().min(1).nullable(),
  }),
});

export function parseApiResponse<TValue>(
  schema: ApiResponseSchema<TValue>,
  value: unknown,
): TValue {
  return schema.parse(value);
}
