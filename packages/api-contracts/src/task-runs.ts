import { z } from "zod";
import {
  IsoDateTimeStringSchema,
  JsonValueSchema,
  ListPaginationSchema,
  TaskAttemptStatusSchema,
  TaskEventLevelSchema,
  TaskRunStatusSchema,
} from "./common.js";

const TaskRunTaskSchema = z.object({
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
});

export const TaskRunListItemSchema = z.object({
  id: z.string().min(1),
  status: TaskRunStatusSchema,
  createdAt: IsoDateTimeStringSchema,
  startedAt: IsoDateTimeStringSchema.nullable(),
  lastHeartbeatAt: IsoDateTimeStringSchema.nullable(),
  completedAt: IsoDateTimeStringSchema.nullable(),
  task: TaskRunTaskSchema,
  attemptsCount: z.number().int().min(0),
  eventsCount: z.number().int().min(0),
});

export const TaskRunAttemptSchema = z.object({
  id: z.string().min(1),
  attemptNumber: z.number().int().min(1),
  status: TaskAttemptStatusSchema,
  error: JsonValueSchema,
  startedAt: IsoDateTimeStringSchema.nullable(),
  completedAt: IsoDateTimeStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
});

export const TaskRunEventSchema = z.object({
  id: z.string().min(1),
  taskAttemptId: z.string().min(1).nullable(),
  type: z.string().min(1),
  level: TaskEventLevelSchema,
  message: z.string().nullable(),
  data: JsonValueSchema,
  traceId: z.string().min(1).nullable(),
  spanId: z.string().min(1).nullable(),
  parentSpanId: z.string().min(1).nullable(),
  createdAt: IsoDateTimeStringSchema,
});

export const TaskRunDetailSchema = z.object({
  id: z.string().min(1),
  status: TaskRunStatusSchema,
  deploymentId: z.string().min(1).nullable(),
  scheduleId: z.string().min(1).nullable(),
  payload: JsonValueSchema,
  output: JsonValueSchema,
  error: JsonValueSchema,
  delayUntil: IsoDateTimeStringSchema.nullable(),
  startedAt: IsoDateTimeStringSchema.nullable(),
  lastHeartbeatAt: IsoDateTimeStringSchema.nullable(),
  completedAt: IsoDateTimeStringSchema.nullable(),
  createdAt: IsoDateTimeStringSchema,
  updatedAt: IsoDateTimeStringSchema,
  task: TaskRunTaskSchema,
  attemptsCount: z.number().int().min(0),
  eventsCount: z.number().int().min(0),
  traceId: z.string().min(1).nullable(),
  triggerSpanId: z.string().min(1).nullable(),
  attempts: z.array(TaskRunAttemptSchema),
});

export const TaskRunDetailResponseSchema = z.object({
  taskRun: TaskRunDetailSchema,
});

export const TaskRunEventsResponseSchema = z.object({
  events: z.array(TaskRunEventSchema),
  nextCursor: z.string().min(1).nullable(),
  hasMore: z.boolean(),
});

export const CancelTaskRunResponseSchema = z.object({
  taskRun: z.object({
    id: z.string().min(1),
    taskId: z.string().min(1),
    status: z.literal("CANCELED"),
    canceled: z.literal(true),
    alreadyCanceled: z.boolean(),
  }),
});

export const ReplayTaskRunResponseSchema = z.object({
  taskRun: z.object({
    id: z.string().min(1),
    taskId: z.string().min(1),
    status: TaskRunStatusSchema,
    payload: JsonValueSchema,
    createdAt: IsoDateTimeStringSchema,
    replayedFromRunId: z.string().min(1),
  }),
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
export type TaskRunDetailResponse = z.infer<typeof TaskRunDetailResponseSchema>;
export type TaskRunEventsResponse = z.infer<typeof TaskRunEventsResponseSchema>;
export type CancelTaskRunResponse = z.infer<typeof CancelTaskRunResponseSchema>;
export type ReplayTaskRunResponse = z.infer<typeof ReplayTaskRunResponseSchema>;
