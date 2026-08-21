import { Prisma, prisma, type DeploymentStatus } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import {
  type InvalidListQueryResult,
  invalidListQuery,
  parseDecodedListCursor,
  parseListQueryPagination,
  parseOptionalListSearch,
  parseOptionalListUuid,
  resolveListPage,
} from "../../lib/list-query.js";
import type { ListPagination } from "../../lib/list-pagination.js";

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
  pagination: ListPagination;
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
    return invalidListQuery("cursor is invalid");
  }

  const filterWhere = createFilterWhere(input.auth, parsedQuery);
  const where = createTaskListWhere(filterWhere, cursor.value);

  const { items, pagination } = await resolveListPage({
    records: prisma.task.findMany({
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
    totalCount: prisma.task.count({
      where: filterWhere,
    }),
    limit: parsedQuery.pagination.limit,
    cursorKind: TASK_CURSOR_KIND,
    mapRecord: toTaskListItem,
    getCursorValues: (task) => [task.slug, task.id],
  });

  return {
    ok: true as const,
    status: 200 as const,
    tasks: items,
    pagination,
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

function parseTaskListCursor(cursor: string[] | null) {
  return parseDecodedListCursor<TaskListCursor>(cursor, ([slug, id]) =>
    slug && id
      ? {
          slug,
          id,
        }
      : null,
  );
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

function parseTaskListQuery(
  query: Record<string, unknown>,
): ({ ok: true } & ParsedTaskListQuery) | InvalidListQueryResult {
  const pagination = parseListQueryPagination({
    query,
    cursorKind: TASK_CURSOR_KIND,
    cursorValueCount: 2,
  });

  if (!pagination.ok) {
    return pagination;
  }

  const search = parseOptionalListSearch(query.search);

  if (!search.ok) {
    return search;
  }

  const deploymentId = parseOptionalListUuid(
    query.deploymentId,
    "deploymentId must be a valid UUID",
  );

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

function toTaskListItem(task: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  deployment: {
    id: string;
    version: string;
    status: DeploymentStatus;
  } | null;
  _count: {
    runs: number;
    schedules: number;
  };
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    slug: task.slug,
    name: task.name,
    description: task.description,
    deployment: task.deployment,
    runsCount: task._count.runs,
    schedulesCount: task._count.schedules,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
