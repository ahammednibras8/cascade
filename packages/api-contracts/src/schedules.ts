import { z } from "zod";
import {
  DeploymentStatusSchema,
  IsoDateTimeStringSchema,
  JsonValueSchema,
  ListPaginationSchema,
} from "./common.js";

export const TaskScheduleListItemSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  name: z.string().min(1),
  scheduleType: z.enum(["INTERVAL", "CRON"]),
  intervalSeconds: z.number().int().positive().nullable(),
  cronExpression: z.string().min(1).nullable(),
  timezone: z.string().min(1),
  nextRunAt: IsoDateTimeStringSchema,
  lastRunAt: IsoDateTimeStringSchema.nullable(),
  enabled: z.boolean(),
  hasPayload: z.boolean(),
  revision: z.number().int().positive(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
  task: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    deployment: z
      .object({
        id: z.string().min(1),
        version: z.string().min(1),
        status: DeploymentStatusSchema,
      })
      .nullable(),
  }),
});

export const ListTaskSchedulesResponseSchema = z.object({
  schedules: z.array(TaskScheduleListItemSchema),
  pagination: ListPaginationSchema,
});

export const TaskScheduleDetailResponseSchema = z.object({
  schedule: z.object({
    id: z.string().min(1),
    taskId: z.string().min(1),
    name: z.string().min(1),
    scheduleType: z.enum(["INTERVAL", "CRON"]),
    intervalSeconds: z.number().int().positive().nullable(),
    cronExpression: z.string().min(1).nullable(),
    timezone: z.string().min(1),
    nextRunAt: IsoDateTimeStringSchema,
    lastRunAt: IsoDateTimeStringSchema.nullable(),
    enabled: z.boolean(),
    payload: JsonValueSchema,
    revision: z.number().int().min(1),
    createdAt: IsoDateTimeStringSchema,
    updatedAt: IsoDateTimeStringSchema,
    task: z.object({
      id: z.string().min(1),
      slug: z.string().min(1),
      name: z.string().min(1),
    }),
  }),
});

export type ListTaskSchedulesResponse = z.infer<typeof ListTaskSchedulesResponseSchema>;
export type TaskScheduleDetailResponse = z.infer<typeof TaskScheduleDetailResponseSchema>;
