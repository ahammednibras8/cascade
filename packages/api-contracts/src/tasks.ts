import { z } from "zod";
import { DeploymentStatusSchema, IsoDateTimeStringSchema, ListPaginationSchema } from "./common.js";

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

export type ListTasksResponse = z.infer<typeof ListTasksResponseSchema>;
