import { createListCursor, type ListPagination, parseListPagination } from "./list-pagination.js";
import { isUuid } from "./route-params.js";
import { failure } from "./service-result.js";

export type InvalidListQueryResult = {
  ok: false;
  status: 400;
  error: { code: "INVALID_LIST_QUERY"; message: string };
};

type CursorResult<TCursor> = { ok: true; value: TCursor | null } | { ok: false };
type OptionalResult<TValue> = { ok: true; value: TValue | null } | InvalidListQueryResult;
type PaginationResult = { ok: true; pagination: ListPagination } | InvalidListQueryResult;

type ResolveListPageInput<TRecord, TItem> = {
  records: Promise<TRecord[]>;
  totalCount: Promise<number>;
  limit: number;
  cursorKind: string;
  mapRecord: (record: TRecord) => TItem;
  getCursorValues: (record: TRecord) => string[];
};

export function invalidListQuery(message: string): InvalidListQueryResult {
  return failure(400, "INVALID_LIST_QUERY", message);
}

export function parseListQueryPagination(input: {
  query: Record<string, unknown>;
  cursorKind: string;
  cursorValueCount: number;
}): PaginationResult {
  const pagination = parseListPagination(input);

  return pagination.ok
    ? pagination
    : {
        ok: false,
        status: 400,
        error: pagination.error,
      };
}

export function parseDecodedListCursor<TCursor>(
  cursor: string[] | null,
  parse: (cursor: string[]) => TCursor | null,
): CursorResult<TCursor> {
  if (!cursor) {
    return { ok: true, value: null };
  }

  const value = parse(cursor);

  return value ? { ok: true, value } : { ok: false };
}

export function parseOptionalListDate(value: unknown, name: string): OptionalResult<Date> {
  if (value === undefined) {
    return optionalValue(null);
  }

  if (typeof value !== "string") {
    return invalidDateQuery(name);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? invalidDateQuery(name) : optionalValue(date);
}

export function parseOptionalListEnum<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
  message: string,
): OptionalResult<TValue> {
  if (value === undefined) {
    return optionalValue(null);
  }

  return typeof value === "string" && allowedValues.includes(value as TValue)
    ? optionalValue(value as TValue)
    : invalidListQuery(message);
}

export function parseOptionalListSearch(value: unknown): OptionalResult<string> {
  if (value === undefined) {
    return optionalValue(null);
  }

  if (typeof value !== "string" || value.trim().length === 0 || value.length > 100) {
    return invalidListQuery("search must contain between 1 and 100 characters");
  }

  return optionalValue(value.trim());
}

export function parseOptionalListUuid(value: unknown, message: string): OptionalResult<string> {
  if (value === undefined) {
    return optionalValue(null);
  }

  return typeof value === "string" && isUuid(value)
    ? optionalValue(value)
    : invalidListQuery(message);
}

export async function resolveListPage<TRecord, TItem>({
  records,
  totalCount,
  limit,
  cursorKind,
  mapRecord,
  getCursorValues,
}: ResolveListPageInput<TRecord, TItem>) {
  const [recordPage, count] = await Promise.all([records, totalCount]);
  const items = recordPage.slice(0, limit);
  const lastItem = items.at(-1);
  const hasMore = recordPage.length > limit;

  return {
    items: items.map(mapRecord),
    pagination: {
      limit,
      nextCursor:
        hasMore && lastItem ? createListCursor(cursorKind, getCursorValues(lastItem)) : null,
      hasMore,
      totalCount: count,
    },
  };
}

function invalidDateQuery(name: string) {
  return invalidListQuery(`${name} must be a valid ISO 8601 timestamp`);
}

function optionalValue<TValue>(value: TValue | null) {
  return { ok: true as const, value };
}
