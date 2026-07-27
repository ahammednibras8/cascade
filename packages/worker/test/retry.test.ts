import { describe, expect, it } from "vitest";
import { getRetryDelayMs } from "../src/retry.js";

describe("getRetryDelayMs", () => {
  it("returns fixed delay when exponential backoff is disabled", () => {
    expect(
      getRetryDelayMs(1, {
        delayMs: 1000,
        exponentialBackoff: false,
      }),
    ).toBe(1000);

    expect(
      getRetryDelayMs(3, {
        delayMs: 1000,
        exponentialBackoff: false,
      }),
    ).toBe(1000);
  });

  it("returns exponential delay when exponential backoff is enabled", () => {
    expect(
      getRetryDelayMs(1, {
        delayMs: 1000,
        exponentialBackoff: true,
      }),
    ).toBe(1000);

    expect(
      getRetryDelayMs(2, {
        delayMs: 1000,
        exponentialBackoff: true,
      }),
    ).toBe(2000);

    expect(
      getRetryDelayMs(3, {
        delayMs: 1000,
        exponentialBackoff: true,
      }),
    ).toBe(4000);
  });
});
