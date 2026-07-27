import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";

export async function listTaskRunEvents(input: {
  auth: ApiAuthContext;
  runId: string | undefined;
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

  const events = await prisma.taskEvent.findMany({
    where: { taskRunId: run.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
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

  return {
    ok: true as const,
    status: 200 as const,
    events: events.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
