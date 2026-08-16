import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";

export async function listTaskSchedules(input: { auth: ApiAuthContext }) {
  const schedules = await prisma.taskSchedule.findMany({
    where: {
      task: {
        environmentId: input.auth.environmentId,
      },
    },
    orderBy: {
      nextRunAt: "asc",
    },
    take: 100,
    select: {
      id: true,
      taskId: true,
      name: true,
      scheduleType: true,
      intervalSeconds: true,
      cronExpression: true,
      timezone: true,
      nextRunAt: true,
      lastRunAt: true,
      enabled: true,
      payload: true,
      revision: true,
      createdAt: true,
      updatedAt: true,
      task: {
        select: {
          id: true,
          slug: true,
          name: true,
          deployment: {
            select: {
              id: true,
              version: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return {
    ok: true as const,
    status: 200 as const,
    schedules: schedules.map((schedule) => ({
      id: schedule.id,
      taskId: schedule.taskId,
      name: schedule.name,
      scheduleType: schedule.scheduleType,
      intervalSeconds: schedule.intervalSeconds,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      nextRunAt: schedule.nextRunAt.toISOString(),
      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      enabled: schedule.enabled,
      hasPayload: schedule.payload !== null,
      revision: schedule.revision,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
      task: schedule.task,
    })),
  };
}
