import { z } from "zod";
import {
  IsoDateTimeStringSchema,
  JsonValueSchema,
  ListPaginationSchema,
  TaskRunStatusSchema,
} from "./common.js";

export const TaskRunListItemSchema = z.object({
  id: z.string().min(1),
  status: TaskRunStatusSchema,
  createdAt: IsoDateTimeStringSchema,
  startedAt: IsoDateTimeStringSchema.nullable(),
  lastHeartbeatAt: IsoDateTimeStringSchema.nullable(),
  completedAt: IsoDateTimeStringSchema.nullable(),
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
    createdAt: IsoDateTimeStringSchema,
    idempotentReplay: z.boolean(),
    traceparent: z.string().min(1),
  }),
});

export type ListTaskRunsResponse = z.infer<typeof ListTaskRunsResponseSchema>;
export type TriggerTaskRunResponse = z.infer<typeof TriggerTaskRunResponseSchema>;
