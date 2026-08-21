import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success } from "../../lib/service-result.js";

export async function getTask(input: { auth: ApiAuthContext; taskId: string | undefined }) {
  if (!isUuid(input.taskId)) {
    return failure(400, "INVALID_TASK_ID", "taskId must be a valid UUID");
  }

  const task = await prisma.task.findFirst({
    where: {
      id: input.taskId,
      environmentId: input.auth.environmentId,
      executionConfig: {
        not: Prisma.DbNull,
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      executionConfig: true,
      createdAt: true,
      updatedAt: true,
      deployment: {
        select: {
          id: true,
          version: true,
          image: true,
          status: true,
          runtimeStatus: true,
        },
      },
      schedules: {
        orderBy: {
          nextRunAt: "asc",
        },
        take: 50,
        select: {
          id: true,
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
        },
      },
      runs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
        select: {
          id: true,
          status: true,
          deploymentId: true,
          scheduleId: true,
          createdAt: true,
          startedAt: true,
          lastHeartbeatAt: true,
          completedAt: true,
          _count: {
            select: {
              attempts: true,
              events: true,
            },
          },
        },
      },
      _count: {
        select: {
          runs: true,
          schedules: true,
        },
      },
    },
  });

  if (!task) {
    return failure(404, "TASK_NOT_FOUND", "Task was not found in this environment");
  }

  return success(200, {
    task: {
      id: task.id,
      slug: task.slug,
      name: task.name,
      description: task.description,
      executionConfig: task.executionConfig,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      deployment: task.deployment,
      runsCount: task._count.runs,
      schedulesCount: task._count.schedules,
      schedules: task.schedules.map((schedule) => ({
        id: schedule.id,
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
      })),
      recentRuns: task.runs.map((run) => ({
        id: run.id,
        status: run.status,
        deploymentId: run.deploymentId,
        scheduleId: run.scheduleId,
        attemptsCount: run._count.attempts,
        eventsCount: run._count.events,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
    },
  });
}
