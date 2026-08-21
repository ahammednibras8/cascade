import { prisma, type Prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { createListCursor, parseListPagination } from "../../lib/list-pagination.js";
import { isUuid } from "../../lib/route-params.js";

const RUN_CURSOR_KIND = "runs-created-at-desc";

const taskRunStatuses = ["PENDING", "EXECUTING", "COMPLETED", "FAILED", "CANCELED"] as const;

type TaskRunStatus = (typeof taskRunStatuses)[number];

type RunListFilters = {
  status: TaskRunStatus | null;
  taskId: string | null;
  createdAfter: Date | null;
  createdBefore: Date | null;
};

type RunListCursor = {
  createdAt: Date;
  id: string;
};

type ListTaskRunsInput = {
  auth: ApiAuthContext;
  query: Record<string, unknown>;
};

export async function listTaskRuns(input: ListTaskRunsInput) {
  const query = parseRunListQuery(input.query);

  if (!query.ok) {
    return query;
  }

  const cursor = parseRunListCursor(query.pagination.cursor);

  if (!cursor.ok) {
    return invalidQuery("cursor is invalid");
  }

  const filterWhere = createFilterWhere(input.auth, query.filters);
  const where = createTaskRunWhere(filterWhere, cursor.value);

  const [records, totalCount] = await Promise.all([
    prisma.taskRun.findMany({
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
    prisma.taskRun.count({
      where: filterWhere,
    }),
  ]);

  const hasMore = records.length > query.pagination.limit;
  const runs = records.slice(0, query.pagination.limit);
  const lastRun = runs.at(-1);

  return {
    ok: true as const,
    status: 200 as const,
    taskRuns: runs.map((run) => ({
      id: run.id,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      task: run.task,
      attemptsCount: run._count.attempts,
      eventsCount: run._count.events,
    })),
    pagination: {
      limit: query.pagination.limit,
      nextCursor:
        hasMore && lastRun
          ? createListCursor(RUN_CURSOR_KIND, [lastRun.createdAt.toISOString(), lastRun.id])
          : null,
      hasMore,
      totalCount,
    },
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

function parseRunListCursor(cursor: string[] | null):
  | {
      ok: true;
      value: RunListCursor | null;
    }
  | {
      ok: false;
    } {
  if (!cursor) {
    return {
      ok: true,
      value: null,
    };
  }

  const createdAt = parseCursorDate(cursor[0]);
  const id = cursor[1];

  if (!createdAt || !id) {
    return {
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      createdAt,
      id,
    },
  };
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

function parseRunListQuery(query: Record<string, unknown>):
  | {
      ok: true;
      pagination: {
        limit: number;
        cursor: string[] | null;
      };
      filters: RunListFilters;
    }
  | {
      ok: false;
      status: 400;
      error: {
        code: "INVALID_LIST_QUERY";
        message: string;
      };
    } {
  const pagination = parseListPagination({
    query,
    cursorKind: RUN_CURSOR_KIND,
    cursorValueCount: 2,
  });

  if (!pagination.ok) {
    return {
      ok: false,
      status: 400,
      error: pagination.error,
    };
  }

  const status = parseStatus(query.status);

  if (!status.ok) {
    return status;
  }

  const taskId = parseTaskId(query.taskId);

  if (!taskId.ok) {
    return taskId;
  }

  const createdAfter = parseDate(query.createdAfter, "createdAfter");

  if (!createdAfter.ok) {
    return createdAfter;
  }

  const createdBefore = parseDate(query.createdBefore, "createdBefore");

  if (!createdBefore.ok) {
    return createdBefore;
  }

  if (
    createdAfter.value &&
    createdBefore.value &&
    createdAfter.value.getTime() > createdBefore.value.getTime()
  ) {
    return invalidQuery("createdAfter must be before or equal to createdBefore");
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

function parseStatus(value: unknown):
  | {
      ok: true;
      value: TaskRunStatus | null;
    }
  | {
      ok: false;
      status: 400;
      error: {
        code: "INVALID_LIST_QUERY";
        message: string;
      };
    } {
  if (value === undefined) {
    return {
      ok: true,
      value: null,
    };
  }

  if (typeof value !== "string" || !taskRunStatuses.includes(value as TaskRunStatus)) {
    return invalidQuery("status must be one of PENDING, EXECUTING, COMPLETED, FAILED, or CANCELED");
  }

  return {
    ok: true,
    value: value as TaskRunStatus,
  };
}

function parseTaskId(value: unknown):
  | {
      ok: true;
      value: string | null;
    }
  | {
      ok: false;
      status: 400;
      error: {
        code: "INVALID_LIST_QUERY";
        message: string;
      };
    } {
  if (value === undefined) {
    return {
      ok: true,
      value: null,
    };
  }

  if (typeof value !== "string" || !isUuid(value)) {
    return invalidQuery("taskId must be a valid UUID");
  }

  return {
    ok: true,
    value,
  };
}

function parseDate(
  value: unknown,
  name: "createdAfter" | "createdBefore",
):
  | {
      ok: true;
      value: Date | null;
    }
  | {
      ok: false;
      status: 400;
      error: {
        code: "INVALID_LIST_QUERY";
        message: string;
      };
    } {
  if (value === undefined) {
    return {
      ok: true,
      value: null,
    };
  }

  if (typeof value !== "string") {
    return invalidQuery(`${name} must be a valid ISO 8601 timestamp`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return invalidQuery(`${name} must be a valid ISO 8601 timestamp`);
  }

  return {
    ok: true,
    value: date,
  };
}

function parseCursorDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function invalidQuery(message: string) {
  return {
    ok: false as const,
    status: 400 as const,
    error: {
      code: "INVALID_LIST_QUERY" as const,
      message,
    },
  };
}
