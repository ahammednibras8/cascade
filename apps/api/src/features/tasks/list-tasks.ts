import { Prisma, prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { createListCursor, parseListPagination } from "../../lib/list-pagination.js";
import { isUuid } from "../../lib/route-params.js";

const TASK_CURSOR_KIND = "tasks-slug-asc";

type ListTasksInput = {
  auth: ApiAuthContext;
  query: Record<string, unknown>;
};

type TaskListCursor = {
  slug: string;
  id: string;
};

type ParsedTaskListQuery = {
  pagination: {
    limit: number;
    cursor: string[] | null;
  };
  search: string | null;
  deploymentId: string | null;
};

export async function listTasks(input: ListTasksInput) {
  const parsedQuery = parseTaskListQuery(input.query);

  if (!parsedQuery.ok) {
    return parsedQuery;
  }

  const cursor = parseTaskListCursor(parsedQuery.pagination.cursor);

  if (!cursor.ok) {
    return invalidQuery("cursor is invalid");
  }

  const filterWhere = createFilterWhere(input.auth, parsedQuery);
  const where = createTaskListWhere(filterWhere, cursor.value);

  const [records, totalCount] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ slug: "asc" }, { id: "asc" }],
      take: parsedQuery.pagination.limit + 1,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        deployment: {
          select: {
            id: true,
            version: true,
            status: true,
          },
        },
        _count: {
          select: {
            runs: true,
            schedules: true,
          },
        },
      },
    }),
    prisma.task.count({
      where: filterWhere,
    }),
  ]);

  const hasMore = records.length > parsedQuery.pagination.limit;
  const tasks = records.slice(0, parsedQuery.pagination.limit);
  const lastTask = tasks.at(-1);

  return {
    ok: true as const,
    status: 200 as const,
    tasks: tasks.map((task) => ({
      id: task.id,
      slug: task.slug,
      name: task.name,
      description: task.description,
      deployment: task.deployment,
      runsCount: task._count.runs,
      schedulesCount: task._count.schedules,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
    pagination: {
      limit: parsedQuery.pagination.limit,
      nextCursor:
        hasMore && lastTask
          ? createListCursor(TASK_CURSOR_KIND, [lastTask.slug, lastTask.id])
          : null,
      hasMore,
      totalCount,
    },
  };
}

function createFilterWhere(
  auth: ApiAuthContext,
  parsedQuery: ParsedTaskListQuery,
): Prisma.TaskWhereInput {
  return {
    environmentId: auth.environmentId,
    executionConfig: {
      not: Prisma.DbNull,
    },
    ...(parsedQuery.deploymentId
      ? {
          deploymentId: parsedQuery.deploymentId,
        }
      : {}),
    ...(parsedQuery.search
      ? {
          OR: [
            {
              slug: {
                contains: parsedQuery.search,
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: parsedQuery.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };
}

function parseTaskListCursor(cursor: string[] | null):
  | {
      ok: true;
      value: TaskListCursor | null;
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

  const slug = cursor[0];
  const id = cursor[1];

  if (!slug || !id) {
    return {
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      slug,
      id,
    },
  };
}

function createTaskListWhere(
  filterWhere: Prisma.TaskWhereInput,
  cursor: TaskListCursor | null,
): Prisma.TaskWhereInput {
  if (!cursor) {
    return filterWhere;
  }

  return {
    AND: [
      filterWhere,
      {
        OR: [
          {
            slug: {
              gt: cursor.slug,
            },
          },
          {
            slug: cursor.slug,
            id: {
              gt: cursor.id,
            },
          },
        ],
      },
    ],
  };
}

function parseTaskListQuery(query: Record<string, unknown>):
  | ({
      ok: true;
    } & ParsedTaskListQuery)
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
    cursorKind: TASK_CURSOR_KIND,
    cursorValueCount: 2,
  });

  if (!pagination.ok) {
    return {
      ok: false,
      status: 400,
      error: pagination.error,
    };
  }

  const search = parseSearch(query.search);

  if (!search.ok) {
    return search;
  }

  const deploymentId = parseDeploymentId(query.deploymentId);

  if (!deploymentId.ok) {
    return deploymentId;
  }

  return {
    ok: true,
    pagination: pagination.pagination,
    search: search.value,
    deploymentId: deploymentId.value,
  };
}

function parseSearch(value: unknown):
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

  if (typeof value !== "string" || value.trim().length === 0 || value.length > 100) {
    return invalidQuery("search must contain between 1 and 100 characters");
  }

  return {
    ok: true,
    value: value.trim(),
  };
}

function parseDeploymentId(value: unknown):
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
    return invalidQuery("deploymentId must be a valid UUID");
  }

  return {
    ok: true,
    value,
  };
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
