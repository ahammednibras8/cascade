import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";

export async function getTaskRun(input: { auth: ApiAuthContext; runId: string | undefined }) {
  if (!isUuid(input.runId)) {
    return {
      ok: false as const,
      status: 400 as const,
      error: { code: "INVALID_RUN_ID", message: "runId must be a valid UUID" },
    };
  }

  const run = await prisma.taskRun.findFirst({
    where: {
      id: input.runId,
      task: { environmentId: input.auth.environmentId },
    },
    select: {
      id: true,
      status: true,
      deploymentId: true,
      scheduleId: true,
      payload: true,
      output: true,
      error: true,
      delayUntil: true,
      startedAt: true,
      lastHeartbeatAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      traceId: true,
      triggerSpanId: true,
      task: {
        select: {
          id: true,
          slug: true,
          name: true,
          environment: {
            select: {
              id: true,
              slug: true,
              name: true,
              project: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: { attempts: true, events: true },
      },
      attempts: {
        orderBy: {
          attemptNumber: "asc",
        },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          error: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!run) {
    return {
      ok: false as const,
      status: 404 as const,
      error: { code: "RUN_NOT_FOUND", message: "Task run was not found is this environment" },
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    taskRun: {
      id: run.id,
      status: run.status,
      deploymentId: run.deploymentId,
      scheduleId: run.scheduleId,
      payload: run.payload,
      output: run.output,
      error: run.error,
      delayUntil: run.delayUntil?.toISOString() ?? null,
      startedAt: run.startedAt?.toISOString() ?? null,
      lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt?.toISOString(),
      task: run.task,
      attemptsCount: run._count.attempts,
      eventsCount: run._count.events,
      traceId: run.traceId,
      triggerSpanId: run.triggerSpanId,
      attempts: run.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        starus: attempt.status,
        error: attempt.error,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        completedAt: attempt.completedAt?.toISOString() ?? null,
        createdAt: attempt.createdAt.toISOString(),
      })),
    },
  };
}
