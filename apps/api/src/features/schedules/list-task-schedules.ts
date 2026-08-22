import {
  prisma,
  type Prisma,
  type TaskScheduleType as DbTaskScheduleType,
} from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import {
  type InvalidListQueryResult,
  invalidListQuery,
  parseDecodedListCursor,
  parseListQueryPagination,
  parseOptionalListBoolean,
  parseOptionalListDate,
  parseOptionalListEnum,
  parseOptionalListUuid,
  resolveListPage,
} from "../../lib/list-query.js";
import type { ListPagination } from "../../lib/list-pagination.js";
import { success } from "../../lib/service-result.js";

const SCHEDULE_CURSOR_KIND = "schedules-next-run-at-asc";
const SCHEDULE_TYPES = ["INTERVAL", "CRON"] as const;

type ListTaskSchedulesInput = {
  auth: ApiAuthContext;
  query: Record<string, unknown>;
};

type ScheduleListCursor = {
  nextRunAt: Date;
  id: string;
};

type ParsedScheduleListQuery = {
  pagination: ListPagination;
  taskId: string | null;
  enabled: boolean | null;
  scheduleType: DbTaskScheduleType | null;
  nextRunAfter: Date | null;
  nextRunBefore: Date | null;
};

export async function listTaskSchedules(input: ListTaskSchedulesInput) {
  const query = parseTaskScheduleListQuery(input.query);

  if (!query.ok) {
    return query;
  }

  const cursor = parseScheduleListCursor(query.pagination.cursor);

  if (!cursor.ok) {
    return invalidListQuery("cursor is invalid");
  }

  const filterWhere = createScheduleFilterWhere(input.auth, query);
  const where = createScheduleListWhere(filterWhere, cursor.value);

  const { items, pagination } = await resolveListPage({
    records: prisma.taskSchedule.findMany({
      where,
      orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
      take: query.pagination.limit + 1,
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
    }),
    totalCount: prisma.taskSchedule.count({
      where: filterWhere,
    }),
    limit: query.pagination.limit,
    cursorKind: SCHEDULE_CURSOR_KIND,
    mapRecord: (schedule) => ({
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
    }),
    getCursorValues: (schedule) => [schedule.nextRunAt.toISOString(), schedule.id],
  });

  return success(200, {
    schedules: items,
    pagination,
  });
}

function parseTaskScheduleListQuery(
  query: Record<string, unknown>,
): ({ ok: true } & ParsedScheduleListQuery) | InvalidListQueryResult {
  const pagination = parseListQueryPagination({
    query,
    cursorKind: SCHEDULE_CURSOR_KIND,
    cursorValueCount: 2,
  });

  if (!pagination.ok) {
    return pagination;
  }

  const taskId = parseOptionalListUuid(query["taskId"], "taskId must be a valid UUID");
  const enabled = parseOptionalListBoolean(
    query["enabled"],
    "enabled must be either true or false",
  );
  const scheduleType = parseOptionalListEnum(
    query["scheduleType"],
    SCHEDULE_TYPES,
    "scheduleType must be either INTERVAL or CRON",
  );
  const nextRunAfter = parseOptionalListDate(query["nextRunAfter"], "nextRunAfter");
  const nextRunBefore = parseOptionalListDate(query["nextRunBefore"], "nextRunBefore");

  if (!taskId.ok) return taskId;
  if (!enabled.ok) return enabled;
  if (!scheduleType.ok) return scheduleType;
  if (!nextRunAfter.ok) return nextRunAfter;
  if (!nextRunBefore.ok) return nextRunBefore;

  if (
    nextRunAfter.value &&
    nextRunBefore.value &&
    nextRunAfter.value.getTime() > nextRunBefore.value.getTime()
  ) {
    return invalidListQuery("nextRunAfter must be before or equal to nextRunBefore");
  }

  return {
    ok: true,
    pagination: pagination.pagination,
    taskId: taskId.value,
    enabled: enabled.value,
    scheduleType: scheduleType.value,
    nextRunAfter: nextRunAfter.value,
    nextRunBefore: nextRunBefore.value,
  };
}

function parseScheduleListCursor(cursor: string[] | null) {
  return parseDecodedListCursor<ScheduleListCursor>(cursor, ([nextRunAtValue, id]) => {
    const nextRunAt = parseCursorDate(nextRunAtValue);

    return nextRunAt && id
      ? {
          nextRunAt,
          id,
        }
      : null;
  });
}

function createScheduleFilterWhere(
  auth: ApiAuthContext,
  query: ParsedScheduleListQuery,
): Prisma.TaskScheduleWhereInput {
  const nextRunAt: Prisma.DateTimeFilter = {};

  if (query.nextRunAfter) {
    nextRunAt.gte = query.nextRunAfter;
  }

  if (query.nextRunBefore) {
    nextRunAt.lte = query.nextRunBefore;
  }

  return {
    task: {
      environmentId: auth.environmentId,
    },
    ...(query.taskId ? { taskId: query.taskId } : {}),
    ...(query.enabled === null ? {} : { enabled: query.enabled }),
    ...(query.scheduleType ? { scheduleType: query.scheduleType } : {}),
    ...(Object.keys(nextRunAt).length > 0 ? { nextRunAt } : {}),
  };
}

function createScheduleListWhere(
  filterWhere: Prisma.TaskScheduleWhereInput,
  cursor: ScheduleListCursor | null,
): Prisma.TaskScheduleWhereInput {
  if (!cursor) {
    return filterWhere;
  }

  return {
    AND: [
      filterWhere,
      {
        OR: [
          {
            nextRunAt: {
              gt: cursor.nextRunAt,
            },
          },
          {
            nextRunAt: cursor.nextRunAt,
            id: {
              gt: cursor.id,
            },
          },
        ],
      },
    ],
  };
}

function parseCursorDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}
