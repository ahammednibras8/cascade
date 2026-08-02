import type { TraceContext } from "@cascade/core";
import type { Prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";

export const taskRunSelect = {
  id: true,
  taskId: true,
  status: true,
  payload: true,
  createdAt: true,
  idempotencyRequestHash: true,
  delayUntil: true,
  traceId: true,
  triggerSpanId: true,
  deploymentId: true,
} satisfies Prisma.TaskRunSelect;

export const taskSelect = {
  id: true,
  slug: true,
  name: true,
  deploymentId: true,
  executionConfig: true,
} satisfies Prisma.TaskSelect;

export type TriggerTask = Prisma.TaskGetPayload<{
  select: typeof taskSelect;
}>;

export type TriggeredTaskRun = Prisma.TaskRunGetPayload<{
  select: typeof taskRunSelect;
}>;

export type TriggerTaskRunInput = {
  auth: ApiAuthContext;
  taskId?: string | undefined;
  taskSlug?: string | undefined;
  body: unknown;
  idempotencyKey: string | undefined;
  traceparent: string | undefined;
  trace?: TraceContext | undefined;
};

type TriggerTaskRunSuccess = {
  ok: true;
  status: 200 | 202;
  idempotentReplayed: boolean;
  taskRun: {
    id: string;
    taskId: string;
    taskSlug: string;
    taskName: string;
    status: string;
    payload: unknown;
    createdAt: string;
    idempotentReplay: boolean;
    traceparent: string;
  };
};

export type TriggerTaskRunFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: {
    code: string;
    message: string;
  };
};

export type TriggerTaskRunResult = TriggerTaskRunSuccess | TriggerTaskRunFailure;
