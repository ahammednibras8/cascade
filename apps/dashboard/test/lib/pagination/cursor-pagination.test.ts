import { describe, expect, it } from "vitest";
import {
  createCursorPagePath,
  createListPath,
} from "../../../app/lib/pagination/cursor-pagination.js";

describe("cursor pagination paths", () => {
  it("sets a next cursor and preserves filters", () => {
    expect(
      createCursorPagePath({
        pathname: "/runs",
        search: "?status=FAILED&cursor=old-cursor&limit=25",
        cursor: "next-cursor",
      }),
    ).toBe("/runs?status=FAILED&cursor=next-cursor&limit=25");
  });

  it("removes the cursor when returning to the first page", () => {
    expect(
      createCursorPagePath({
        pathname: "/schedules",
        search: "?enabled=false&scheduleType=CRON&cursor=next-cursor",
        cursor: null,
      }),
    ).toBe("/schedules?enabled=false&scheduleType=CRON");
  });

  it("returns a path without a question mark when no parameters exist", () => {
    expect(createListPath("/tasks", new URLSearchParams())).toBe("/tasks");
  });
});
