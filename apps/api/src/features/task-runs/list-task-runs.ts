import { prisma, type Prisma, type TaskRunStatus as DbTaskRunStatus } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import {
  type InvalidListQueryResult,
  invalidListQuery,
  parseDecodedListCursor,
  parseListQueryPagination,
  parseOptionalListDate,
  parseOptionalListEnum,
  parseOptionalListUuid,
  resolveListPage,
} from "../../lib/list-query.js";
import type { ListPagination } from "../../lib/list-pagination.js";

const RUN_CURSOR_KIND = "runs-created-at-desc";

const taskRunStatuses = ["PENDING", "EXECUTING", "COMPLETED", "FAILED", "CANCELED"] as const;

type RunListFilters = {
  status: DbTaskRunStatus | null;
  taskId: string | null;
  createdAfter: Date | null;
  createdBefore: Date | null;
};

type RunListCursor = {
  createdAt: Date;
  id: string;
};

type ListTaskRunsInput = { auth: ApiAuthContext; query: Record<string, unknown> };

type ParsedRunListQuery = {
  pagination: ListPagination;
  filters: RunListFilters;
};

export async function listTaskRuns(input: ListTaskRunsInput) {
  const query = parseRunListQuery(input.query);

  if (!query.ok) {
    return query;
  }

  const cursor = parseRunListCursor(query.pagination.cursor);

  if (!cursor.ok) {
    return invalidListQuery("cursor is invalid");
  }

  const filterWhere = createFilterWhere(input.auth, query.filters);
  const where = createTaskRunWhere(filterWhere, cursor.value);

  const { items, pagination } = await resolveListPage({
    records: prisma.taskRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.pagination.limit + 1,
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        lastHeartbeatAt: true,
        completedAt: true,
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
          select: {
            attempts: true,
            events: true,
          },
        },
      },
    }),
    totalCount: prisma.taskRun.count({
      where: filterWhere,
    }),
    limit: query.pagination.limit,
    cursorKind: RUN_CURSOR_KIND,
    mapRecord: toTaskRunListItem,
    getCursorValues: (run) => [run.createdAt.toISOString(), run.id],
  });

  return {
    ok: true as const,
    status: 200 as const,
    taskRuns: items,
    pagination,
  };
}

function createFilterWhere(
  auth: ApiAuthContext,
  filters: RunListFilters,
): Prisma.TaskRunWhereInput {
  return {
    task: {
      environmentId: auth.environmentId,
    },
    ...(filters.status
      ? {
          status: filters.status,
        }
      : {}),
    ...(filters.taskId
      ? {
          taskId: filters.taskId,
        }
      : {}),
    ...(filters.createdAfter || filters.createdBefore
      ? {
          createdAt: {
            ...(filters.createdAfter
              ? {
                  gte: filters.createdAfter,
                }
              : {}),
            ...(filters.createdBefore
              ? {
                  lte: filters.createdBefore,
                }
              : {}),
          },
        }
      : {}),
  };
}

function parseRunListCursor(cursor: string[] | null) {
  return parseDecodedListCursor<RunListCursor>(cursor, ([createdAtValue, id]) => {
    const createdAt = parseCursorDate(createdAtValue);

    return createdAt && id
      ? {
          createdAt,
          id,
        }
      : null;
  });
}

function createTaskRunWhere(
  filterWhere: Prisma.TaskRunWhereInput,
  cursor: RunListCursor | null,
): Prisma.TaskRunWhereInput {
  if (!cursor) {
    return filterWhere;
  }

  return {
    ...filterWhere,
    OR: [
      {
        createdAt: {
          lt: cursor.createdAt,
        },
      },
      {
        createdAt: cursor.createdAt,
        id: {
          lt: cursor.id,
        },
      },
    ],
  };
}

function parseRunListQuery(
  query: Record<string, unknown>,
): ({ ok: true } & ParsedRunListQuery) | InvalidListQueryResult {
  const pagination = parseListQueryPagination({
    query,
    cursorKind: RUN_CURSOR_KIND,
    cursorValueCount: 2,
  });

  if (!pagination.ok) {
    return pagination;
  }

  const status = parseOptionalListEnum(
    query.status,
    taskRunStatuses,
    "status must be one of PENDING, EXECUTING, COMPLETED, FAILED, or CANCELED",
  );

  if (!status.ok) {
    return status;
  }

  const taskId = parseOptionalListUuid(query.taskId, "taskId must be a valid UUID");

  if (!taskId.ok) {
    return taskId;
  }

  const createdAfter = parseOptionalListDate(query.createdAfter, "createdAfter");

  if (!createdAfter.ok) {
    return createdAfter;
  }

  const createdBefore = parseOptionalListDate(query.createdBefore, "createdBefore");

  if (!createdBefore.ok) {
    return createdBefore;
  }

  if (
    createdAfter.value &&
    createdBefore.value &&
    createdAfter.value.getTime() > createdBefore.value.getTime()
  ) {
    return invalidListQuery("createdAfter must be before or equal to createdBefore");
  }

  return {
    ok: true,
    pagination: pagination.pagination,
    filters: {
      status: status.value,
      taskId: taskId.value,
      createdAfter: createdAfter.value,
      createdBefore: createdBefore.value,
    },
  };
}

function parseCursorDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toTaskRunListItem(run: {
  id: string;
  status: DbTaskRunStatus;
  createdAt: Date;
  startedAt: Date | null;
  lastHeartbeatAt: Date | null;
  completedAt: Date | null;
  task: {
    id: string;
    slug: string;
    name: string;
    environment: {
      id: string;
      slug: string;
      name: string;
      project: {
        id: string;
        slug: string;
        name: string;
      };
    };
  };
  _count: {
    attempts: number;
    events: number;
  };
}) {
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    task: run.task,
    attemptsCount: run._count.attempts,
    eventsCount: run._count.events,
  };
}
