import { describe, expect, it } from "vitest";
import { parseTaskExecutionConfig } from "../src/execution-config.js";

const validConfig = {
  schemaVersion: 1,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    exponentialBackoff: true,
  },
  queue: {
    name: " hello ",
    concurrencyLimit: 2,
  },
};

describe("parseTaskExecutionConfig", () => {
  it("parses and normalizes a complete task execution config", () => {
    expect(parseTaskExecutionConfig(validConfig)).toEqual({
      schemaVersion: 1,
      timeoutMs: 30_000,
      retry: {
        maxAttempts: 3,
        delayMs: 1000,
        exponentialBackoff: true,
      },
      queue: {
        name: "hello",
        concurrencyLimit: 2,
      },
    });
  });

  it("allows null timeout and queue concurrency", () => {
    expect(
      parseTaskExecutionConfig({
        ...validConfig,
        timeoutMs: null,
        queue: {
          name: "hello",
          concurrencyLimit: null,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        timeoutMs: null,
        queue: {
          name: "hello",
          concurrencyLimit: null,
        },
      }),
    );
  });

  it("rejects incomplete or invalid config", () => {
    expect(parseTaskExecutionConfig(null)).toBeNull();
    expect(parseTaskExecutionConfig({ ...validConfig, schemaVersion: 2 })).toBeNull();
    expect(parseTaskExecutionConfig({ ...validConfig, timeoutMs: 0 })).toBeNull();
    expect(
      parseTaskExecutionConfig({ ...validConfig, retry: { ...validConfig.retry, delayMs: -1 } }),
    ).toBeNull();
    expect(
      parseTaskExecutionConfig({ ...validConfig, queue: { ...validConfig.queue, name: "" } }),
    ).toBeNull();
  });
});
