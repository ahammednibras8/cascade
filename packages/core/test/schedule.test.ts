import { describe, expect, it } from "vitest";
import { getNextCronRunAt, parseCronSchedule } from "../src/schedule.js";

describe("parseCronSchedule", () => {
  it("normalizes and accepts a five-field cron expression with an IANA timezone", () => {
    expect(
      parseCronSchedule({
        expression: "  0   9  * * 1-5 ",
        timezone: " Asia/Kolkata ",
      }),
    ).toEqual({
      expression: "0 9 * * 1-5",
      timezone: "Asia/Kolkata",
    });
  });

  it("uses UTC when timezone is omitted", () => {
    expect(
      parseCronSchedule({
        expression: "0 9 * * *",
      }),
    ).toEqual({
      expression: "0 9 * * *",
      timezone: "UTC",
    });
  });

  it("rejects invalid expressions and timezones", () => {
    expect(parseCronSchedule({ expression: "0 25 * * *" })).toBeNull();
    expect(parseCronSchedule({ expression: "0 9 * * * *" })).toBeNull();
    expect(
      parseCronSchedule({
        expression: "0 9 * * *",
        timezone: "Mars/Olympus",
      }),
    ).toBeNull();
  });
});

describe("getNextCronRunAt", () => {
  it("calculates the next occurrence in the schedule timezone", () => {
    const schedule = parseCronSchedule({
      expression: "0 9 * * *",
      timezone: "Asia/Kolkata",
    });

    expect(schedule).not.toBeNull();

    expect(getNextCronRunAt(schedule!, new Date("2026-01-05T03:29:59.000Z")).toISOString()).toBe(
      "2026-01-05T03:30:00.000Z",
    );
  });
});
