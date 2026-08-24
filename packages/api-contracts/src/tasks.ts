import { z } from "zod";
import {
  DeploymentRuntimeStatusSchema,
  DeploymentStatusSchema,
  IsoDateTimeStringSchema,
  ListPaginationSchema,
  TaskExecutionConfigSchema,
  TaskRunStatusSchema,
} from "./common.js";

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
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
});

export const ListTasksResponseSchema = z.object({
  tasks: z.array(TaskListItemSchema),
  pagination: ListPaginationSchema,
});

const TaskDetailScheduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scheduleType: z.enum(["INTERVAL", "CRON"]),
  intervalSeconds: z.number().int().positive().nullable(),
  cronExpression: z.string().min(1).nullable(),
  timezone: z.string().min(1),
  nextRunAt: IsoDateTimeStringSchema,
  lastRunAt: IsoDateTimeStringSchema.nullable(),
  enabled: z.boolean(),
  hasPayload: z.boolean(),
  revision: z.number().int().min(1),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
});

const TaskRecentRunSchema = z.object({
  id: z.string().min(1),
  status: TaskRunStatusSchema,
  deploymentId: z.string().min(1).nullable(),
  scheduleId: z.string().min(1).nullable(),
  attemptsCount: z.number().int().min(0),
  eventsCount: z.number().int().min(0),
  createdAt: IsoDateTimeStringSchema,
  startedAt: IsoDateTimeStringSchema.nullable(),
  lastHeartbeatAt: IsoDateTimeStringSchema.nullable(),
  completedAt: IsoDateTimeStringSchema.nullable(),
});

export const TaskDetailResponseSchema = z.object({
  task: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    executionConfig: TaskExecutionConfigSchema.nullable(),
    deployment: z
      .object({
        id: z.string().min(1),
        version: z.string().min(1),
        image: z.string().min(1),
        status: DeploymentStatusSchema,
        runtimeStatus: DeploymentRuntimeStatusSchema,
      })
      .nullable(),
    runsCount: z.number().int().min(0),
    schedulesCount: z.number().int().min(0),
    schedules: z.array(TaskDetailScheduleSchema),
    recentRuns: z.array(TaskRecentRunSchema),
    createdAt: IsoDateTimeStringSchema,
    updatedAt: IsoDateTimeStringSchema,
  }),
});

export type ListTasksResponse = z.infer<typeof ListTasksResponseSchema>;
export type TaskDetailResponse = z.infer<typeof TaskDetailResponseSchema>;
