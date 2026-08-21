import { prisma, type Prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success } from "../../lib/service-result.js";

const taskEventSelect = {
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
} satisfies Prisma.TaskEventSelect;

type TaskEventRecord = Prisma.TaskEventGetPayload<{
  select: typeof taskEventSelect;
}>;

async function findRunForEventList(input: { auth: ApiAuthContext; runId: string }) {
  return prisma.taskRun.findFirst({
    where: {
      id: input.runId,
      task: { environmentId: input.auth.environmentId },
    },
    select: { id: true },
  });
}

async function getEventCursor(input: { runId: string; afterEventId: string | undefined }) {
  if (!input.afterEventId) {
    return { ok: true as const, cursor: null };
  }

  if (!isUuid(input.afterEventId)) {
    return {
      ok: false as const,
      failure: failure(400, "INVALID_EVENT_CURSOR", "after must be a valid event UUID"),
    };
  }

  const cursor = await prisma.taskEvent.findFirst({
    where: {
      id: input.afterEventId,
      taskRunId: input.runId,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (!cursor) {
    return {
      ok: false as const,
      failure: failure(
        400,
        "INVALID_EVENT_CURSOR",
        "after must identity an event in this task run",
      ),
    };
  }

  return { ok: true as const, cursor };
}

function getEventCursorWhere(cursor: { id: string; createdAt: Date } | null) {
  if (!cursor) {
    return {};
  }

  return {
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
  };
}

function mapTaskEvent(event: TaskEventRecord) {
  return {
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
  };
}

export async function listTaskRunEvents(input: {
  auth: ApiAuthContext;
  runId: string | undefined;
  afterEventId?: string;
}) {
  if (!isUuid(input.runId)) {
    return failure(400, "INVALID_RUN_ID", "runId must be a valid UUID");
  }

  const run = await findRunForEventList({
    auth: input.auth,
    runId: input.runId,
  });

  if (!run) {
    return failure(404, "RUN_NOT_FOUND", "Task run was not found in this environment");
  }

  const cursorResult = await getEventCursor({
    runId: run.id,
    afterEventId: input.afterEventId,
  });

  if (!cursorResult.ok) {
    return cursorResult.failure;
  }

  const eventPage = await prisma.taskEvent.findMany({
    where: {
      taskRunId: run.id,
      ...getEventCursorWhere(cursorResult.cursor),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 101,
    select: taskEventSelect,
  });

  const hasMore = eventPage.length > 100;
  const events = eventPage.slice(0, 100);

  return success(200, {
    events: events.map(mapTaskEvent),
    nextCursor: events.at(-1)?.id ?? input.afterEventId ?? null,
    hasMore,
  });
}
