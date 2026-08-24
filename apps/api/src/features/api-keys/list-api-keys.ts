import { prisma, type Prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import {
  type InvalidListQueryResult,
  invalidListQuery,
  parseDecodedListCursor,
  parseListQueryPagination,
  parseOptionalListBoolean,
  resolveListPage,
} from "../../lib/list-query.js";
import type { ListPagination } from "../../lib/list-pagination.js";
import { success } from "../../lib/service-result.js";
import { toPublicApiKey } from "./api-key-response.js";

const API_KEY_CURSOR_KIND = "api-keys-created-at-desc";

type ListApiKeysInput = {
  auth: ApiAuthContext;
  query: Record<string, unknown>;
};

type ApiKeyListCursor = {
  createdAt: Date;
  id: string;
};

type ParsedApiKeyListQuery = {
  pagination: ListPagination;
  revoked: boolean | null;
};

export async function listApiKeys(input: ListApiKeysInput) {
  const query = parseApiKeyListQuery(input.query);

  if (!query.ok) {
    return query;
  }

  const cursor = parseApiKeyListCursor(query.pagination.cursor);

  if (!cursor.ok) {
    return invalidListQuery("cursor is invalid");
  }

  const filterWhere = createApiKeyFilterWhere(input.auth, query);
  const where = createApiKeyListWhere(filterWhere, cursor.value);

  const { items, pagination } = await resolveListPage({
    records: prisma.apiKey.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.pagination.limit + 1,
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        rotatedFromId: true,
      },
    }),
    totalCount: prisma.apiKey.count({
      where: filterWhere,
    }),
    limit: query.pagination.limit,
    cursorKind: API_KEY_CURSOR_KIND,
    mapRecord: toPublicApiKey,
    getCursorValues: (apiKey) => [apiKey.createdAt.toISOString(), apiKey.id],
  });

  return success(200, {
    apiKeys: items,
    pagination,
  });
}

function parseApiKeyListQuery(
  query: Record<string, unknown>,
): ({ ok: true } & ParsedApiKeyListQuery) | InvalidListQueryResult {
  const pagination = parseListQueryPagination({
    query,
    cursorKind: API_KEY_CURSOR_KIND,
    cursorValueCount: 2,
  });

  if (!pagination.ok) {
    return pagination;
  }

  const revoked = parseOptionalListBoolean(
    query["revoked"],
    "revoked must be either true or false",
  );

  if (!revoked.ok) {
    return revoked;
  }

  return {
    ok: true,
    pagination: pagination.pagination,
    revoked: revoked.value,
  };
}

function createApiKeyFilterWhere(
  auth: ApiAuthContext,
  query: ParsedApiKeyListQuery,
): Prisma.ApiKeyWhereInput {
  return {
    environmentId: auth.environmentId,
    ...(query.revoked === null
      ? {}
      : {
          revokedAt: query.revoked ? { not: null } : null,
        }),
  };
}

function parseApiKeyListCursor(cursor: string[] | null) {
  return parseDecodedListCursor<ApiKeyListCursor>(cursor, ([createdAtValue, id]) => {
    const createdAt = parseCursorDate(createdAtValue);

    return createdAt && id
      ? {
          createdAt,
          id,
        }
      : null;
  });
}

function createApiKeyListWhere(
  filterWhere: Prisma.ApiKeyWhereInput,
  cursor: ApiKeyListCursor | null,
): Prisma.ApiKeyWhereInput {
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

function parseCursorDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}
