import {
  prisma,
  type DeploymentRuntimeStatus,
  type DeploymentStatus,
  type Prisma,
} from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import {
  type InvalidListQueryResult,
  invalidListQuery,
  parseDecodedListCursor,
  parseListQueryPagination,
  resolveListPage,
} from "../../lib/list-query.js";
import type { ListPagination } from "../../lib/list-pagination.js";
import { success } from "../../lib/service-result.js";

const DEPLOYMENT_CURSOR_KIND = "deployments-created-at-desc";

type ListDeploymentsInput = {
  auth: ApiAuthContext;
  query: Record<string, unknown>;
};

type DeploymentListCursor = {
  createdAt: Date;
  id: string;
};

type ParsedDeploymentListQuery = {
  pagination: ListPagination;
};

export async function listDeployments(input: ListDeploymentsInput) {
  const query = parseDeploymentListQuery(input.query);

  if (!query.ok) {
    return query;
  }

  const cursor = parseDeploymentListCursor(query.pagination.cursor);

  if (!cursor.ok) {
    return invalidListQuery("cursor is invalid");
  }

  const filterWhere = createFilterWhere(input.auth);
  const where = createDeploymentListWhere(filterWhere, cursor.value);

  const { items, pagination } = await resolveListPage({
    records: prisma.deployment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.pagination.limit + 1,
      select: {
        id: true,
        environmentId: true,
        version: true,
        image: true,
        status: true,
        runtimeStatus: true,
        runtimeError: true,
        runtimeStartedAt: true,
        runtimeStoppedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            tasks: true,
            runs: true,
          },
        },
      },
    }),
    totalCount: prisma.deployment.count({
      where: filterWhere,
    }),
    limit: query.pagination.limit,
    cursorKind: DEPLOYMENT_CURSOR_KIND,
    mapRecord: toDeploymentListItem,
    getCursorValues: (deployment) => [deployment.createdAt.toISOString(), deployment.id],
  });

  return success(200, {
    deployments: items,
    pagination,
  });
}

function createFilterWhere(auth: ApiAuthContext): Prisma.DeploymentWhereInput {
  return {
    environmentId: auth.environmentId,
  };
}

function parseDeploymentListCursor(cursor: string[] | null) {
  return parseDecodedListCursor<DeploymentListCursor>(cursor, ([createdAtValue, id]) => {
    const createdAt = parseCursorDate(createdAtValue);

    return createdAt && id
      ? {
          createdAt,
          id,
        }
      : null;
  });
}

function createDeploymentListWhere(
  filterWhere: Prisma.DeploymentWhereInput,
  cursor: DeploymentListCursor | null,
): Prisma.DeploymentWhereInput {
  if (!cursor) {
    return filterWhere;
  }

  return {
    AND: [
      filterWhere,
      {
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
      },
    ],
  };
}

function parseDeploymentListQuery(
  query: Record<string, unknown>,
): ({ ok: true } & ParsedDeploymentListQuery) | InvalidListQueryResult {
  const pagination = parseListQueryPagination({
    query,
    cursorKind: DEPLOYMENT_CURSOR_KIND,
    cursorValueCount: 2,
  });

  return pagination.ok
    ? {
        ok: true,
        pagination: pagination.pagination,
      }
    : pagination;
}

function parseCursorDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toDeploymentListItem(deployment: {
  id: string;
  environmentId: string;
  version: string;
  image: string;
  status: DeploymentStatus;
  runtimeStatus: DeploymentRuntimeStatus;
  runtimeError: string | null;
  runtimeStartedAt: Date | null;
  runtimeStoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    tasks: number;
    runs: number;
  };
}) {
  return {
    id: deployment.id,
    environmentId: deployment.environmentId,
    version: deployment.version,
    image: deployment.image,
    status: deployment.status,
    runtimeStatus: deployment.runtimeStatus,
    runtimeError: deployment.runtimeError,
    runtimeStartedAt: deployment.runtimeStartedAt?.toISOString() ?? null,
    runtimeStoppedAt: deployment.runtimeStoppedAt?.toISOString() ?? null,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
    tasksCount: deployment._count.tasks,
    runsCount: deployment._count.runs,
  };
}
