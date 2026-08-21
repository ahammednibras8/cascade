import { z } from "zod";
import {
  DeploymentRuntimeStatusSchema,
  DeploymentStatusSchema,
  IsoDateTimeStringSchema,
  ListPaginationSchema,
  TaskExecutionConfigSchema,
} from "./common.js";

const deploymentBaseSchema = z.object({
  id: z.string().min(1),
  environmentId: z.string().min(1),
  version: z.string().min(1),
  image: z.string().min(1),
  status: DeploymentStatusSchema,
  runtimeStatus: DeploymentRuntimeStatusSchema,
  runtimeError: z.string().nullable(),
  runtimeStartedAt: IsoDateTimeStringSchema.nullable(),
  runtimeStoppedAt: IsoDateTimeStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
});

export const DeploymentListItemSchema = deploymentBaseSchema.extend({
  tasksCount: z.number().int().min(0),
  runsCount: z.number().int().min(0),
});

export const DeploymentManifestTaskSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  executionConfig: TaskExecutionConfigSchema,
  createdAt: IsoDateTimeStringSchema,
});

export const DeploymentTaskSchema = DeploymentManifestTaskSchema.extend({
  executionConfig: TaskExecutionConfigSchema.nullable(),
  updatedAt: IsoDateTimeStringSchema,
  runsCount: z.number().int().min(0),
  schedulesCount: z.number().int().min(0),
});

export const ListDeploymentsResponseSchema = z.object({
  deployments: z.array(DeploymentListItemSchema),
  pagination: ListPaginationSchema,
});

export const DeploymentDetailResponseSchema = z.object({
  deployment: deploymentBaseSchema.extend({
    runsCount: z.number().int().min(0),
    canRollback: z.boolean(),
    manifestTasks: z.array(DeploymentManifestTaskSchema),
    tasks: z.array(DeploymentTaskSchema),
  }),
});

export const DeactivateDeploymentResponseSchema = z.object({
  deployment: z.object({
    id: z.string().min(1),
    status: z.literal("INACTIVE"),
    tasksDetached: z.number().int().min(0),
    schedulesPaused: z.number().int().min(0),
  }),
});

export const RollbackDeploymentResponseSchema = z.object({
  deployment: z.object({
    id: z.string().min(1),
    status: z.literal("ACTIVE"),
    tasksRestored: z.number().int().min(0),
    tasksDetached: z.number().int().min(0),
    schedulesUpdated: z.number().int().min(0),
    schedulesPaused: z.number().int().min(0),
  }),
});

export type ListDeploymentsResponse = z.infer<typeof ListDeploymentsResponseSchema>;
export type DeploymentDetailResponse = z.infer<typeof DeploymentDetailResponseSchema>;
export type DeactivateDeploymentResponse = z.infer<typeof DeactivateDeploymentResponseSchema>;
export type RollbackDeploymentResponse = z.infer<typeof RollbackDeploymentResponseSchema>;
