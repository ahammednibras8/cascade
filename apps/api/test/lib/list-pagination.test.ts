import { describe, expect, it } from "vitest";
import { createListCursor, parseListPagination } from "../../src/lib/list-pagination.js";

describe("list pagination", () => {
  it("uses the default limit with no cursor", () => {
    expect(
      parseListPagination({
        query: {},
        cursorKind: "runs-created-at-desc",
        cursorValueCount: 2,
      }),
    ).toEqual({
      ok: true,
      pagination: {
        limit: 50,
        cursor: null,
      },
    });
  });

  it("accepts a valid limit and cursor", () => {
    const cursor = createListCursor("runs-created-at-desc", ["2026-08-21T00:00:00.000Z", "run-1"]);

    expect(
      parseListPagination({
        query: {
          limit: "25",
          cursor,
        },
        cursorKind: "runs-created-at-desc",
        cursorValueCount: 2,
      }),
    ).toEqual({
      ok: true,
      pagination: {
        limit: 25,
        cursor: ["2026-08-21T00:00:00.000Z", "run-1"],
      },
    });
  });

  it.each(["0", "-1", "101", "1.5", "abc"])("rejects invalid limit %s", (limit) => {
    expect(
      parseListPagination({
        query: {
          limit,
        },
        cursorKind: "runs-created-at-desc",
        cursorValueCount: 2,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "limit must be an integer between 1 and 100",
      },
    });
  });

  it("rejects a malformed cursor", () => {
    expect(
      parseListPagination({
        query: {
          cursor: "not-a-cursor",
        },
        cursorKind: "runs-created-at-desc",
        cursorValueCount: 2,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "cursor is invalid",
      },
    });
  });

  it("rejects a cursor created for another endpoint", () => {
    const cursor = createListCursor("tasks-slug-asc", ["hello", "task-1"]);

    expect(
      parseListPagination({
        query: {
          cursor,
        },
        cursorKind: "runs-created-at-desc",
        cursorValueCount: 2,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "cursor is invalid",
      },
    });
  });
});
