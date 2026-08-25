const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type CursorPayload = {
  version: 1;
  kind: string;
  values: string[];
};

export type ListPagination = {
  limit: number;
  cursor: string[] | null;
};

export type ListPaginationParseResult =
  | {
      ok: true;
      pagination: ListPagination;
    }
  | {
      ok: false;
      error: {
        code: "INVALID_LIST_QUERY";
        message: string;
      };
    };

type ParseListPaginationInput = {
  query: Record<string, unknown>;
  cursorKind: string;
  cursorValueCount: number;
};

export function parseListPagination({
  query,
  cursorKind,
  cursorValueCount,
}: ParseListPaginationInput): ListPaginationParseResult {
  const limitResult = parseLimit(query["limit"]);

  if (!limitResult.ok) {
    return limitResult;
  }

  const cursorResult = parseCursor(query["cursor"], cursorKind, cursorValueCount);

  if (!cursorResult.ok) {
    return cursorResult;
  }

  return {
    ok: true,
    pagination: {
      limit: limitResult.limit,
      cursor: cursorResult.cursor,
    },
  };
}

export function createListCursor(kind: string, values: string[]) {
  const payload: CursorPayload = {
    version: 1,
    kind,
    values,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function parseLimit(value: unknown):
  | {
      ok: true;
      limit: number;
    }
  | {
      ok: false;
      error: {
        code: "INVALID_LIST_QUERY";
        message: string;
      };
    } {
  if (value === undefined) {
    return {
      ok: true,
      limit: DEFAULT_LIMIT,
    };
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return invalidQuery("limit must be an integer between 1 and 100");
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit > MAX_LIMIT) {
    return invalidQuery("limit must be an integer between 1 and 100");
  }

  return {
    ok: true,
    limit,
  };
}

function parseCursor(
  value: unknown,
  expectedKind: string,
  expectedValueCount: number,
):
  | {
      ok: true;
      cursor: string[] | null;
    }
  | {
      ok: false;
      error: {
        code: "INVALID_LIST_QUERY";
        message: string;
      };
    } {
  if (value === undefined) {
    return {
      ok: true,
      cursor: null,
    };
  }

  if (typeof value !== "string" || !value) {
    return invalidQuery("cursor is invalid");
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

    if (
      !isCursorPayload(parsed) ||
      parsed.kind !== expectedKind ||
      parsed.values.length !== expectedValueCount
    ) {
      return invalidQuery("cursor is invalid");
    }

    return {
      ok: true,
      cursor: parsed.values,
    };
  } catch {
    return invalidQuery("cursor is invalid");
  }
}

function isCursorPayload(value: unknown): value is CursorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "values" in value &&
    Array.isArray(value.values) &&
    value.values.every((entry) => typeof entry === "string")
  );
}

function invalidQuery(message: string) {
  return {
    ok: false as const,
    error: {
      code: "INVALID_LIST_QUERY" as const,
      message,
    },
  };
}
