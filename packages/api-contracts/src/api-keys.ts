import { z } from "zod";
import { IsoDateTimeStringSchema, ListPaginationSchema } from "./common.js";

export const ApiKeyScopeSchema = z.enum([
  "TASKS_READ",
  "TASKS_TRIGGER",
  "SCHEDULES_WRITE",
  "RUNS_READ",
  "RUNS_CANCEL",
  "RUNS_REPLAY",
  "DEPLOYMENTS_WRITE",
  "API_KEYS_MANAGE",
]);

export const PublicApiKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  keyPrefix: z.string().min(1),
  scopes: z.array(ApiKeyScopeSchema),
  lastUsedAt: IsoDateTimeStringSchema.nullable(),
  revokedAt: IsoDateTimeStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  rotatedFromId: z.string().min(1).nullable(),
});

export const ApiKeyScopeDefinitionSchema = z.object({
  value: ApiKeyScopeSchema,
  label: z.string().min(1),
  description: z.string().min(1),
});

export const ListApiKeysResponseSchema = z.object({
  apiKeys: z.array(PublicApiKeySchema),
  availableScopes: z.array(ApiKeyScopeDefinitionSchema),
  pagination: ListPaginationSchema,
});

export type ListApiKeysResponse = z.infer<typeof ListApiKeysResponseSchema>;
