import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";

export async function listTaskRunEvents(input: {
  auth: ApiAuthContext;
  runId: string | undefined;
  afterEventId?: string;
}) {
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
    select: { id: true },
  });

  if (!run) {
    return {
      ok: false as const,
      status: 404 as const,
      error: { code: "RUN_NOT_FOUND", message: "Task run was not found in this environment" },
    };
  }

  let cursor: {
    id: string;
    createdAt: Date;
  } | null = null;

  if (input.afterEventId) {
    if (!isUuid(input.afterEventId)) {
      return {
        ok: false as const,
        status: 400 as const,
        error: {
          code: "INVALID_EVENT_CURSOR",
          message: "after must be a valid event UUID",
        },
      };
    }

    cursor = await prisma.taskEvent.findFirst({
      where: {
        id: input.afterEventId,
        taskRunId: run.id,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (!cursor) {
      return {
        ok: false as const,
        status: 400 as const,
        error: {
          code: "INVALID_EVENT_CURSOR",
          message: "after must identity an event in this task run",
        },
      };
    }
  }

  const eventPage = await prisma.taskEvent.findMany({
    where: {
      taskRunId: run.id,
      ...(cursor
        ? {
            OR: [
              {
                createdAt: {
                  gt: cursor.createdAt,
                },
              },
              {
                createdAt: cursor.createdAt,
                id: {
                  gt: cursor.id,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 101,
    select: {
      id: true,
      taskAttemptId: true,
      type: true,
      level: true,
      message: true,
      data: true,
      traceId: true,
      spanId: true,
      parentSpanId: true,
      createdAt: true,
    },
  });

  const hasMore = eventPage.length > 100;
  const events = eventPage.slice(0, 100);

  return {
    ok: true as const,
    status: 200 as const,
    events: events.map((event) => ({
      id: event.id,
      taskAttemptId: event.taskAttemptId,
      type: event.type,
      level: event.level,
      message: event.message,
      data: event.data,
      traceId: event.traceId,
      spanId: event.spanId,
      parentSpanId: event.parentSpanId,
      createdAt: event.createdAt.toISOString(),
    })),
    nextCursor: events.at(-1)?.id ?? input.afterEventId ?? null,
    hasMore,
  };
}
