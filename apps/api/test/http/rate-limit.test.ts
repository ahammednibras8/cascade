import express from "express";
import httpRequest from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/http/error-handler.js";

const redis = vi.hoisted(() => ({
  eval: vi.fn<
    (script: string, numberOfKeys: number, key: string, ttlMs: string) => Promise<unknown>
  >(),
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  taskRunQueueRedis: {
    eval: redis.eval,
  },
}));

const { apiRateLimit } = await import("../../src/http/rate-limit.js");

const originalMaxRequests = process.env["API_RATE_LIMIT_MAX_REQUESTS"];
const originalWindowMs = process.env["API_RATE_LIMIT_WINDOW_MS"];

function createApp() {
  const app = express();

  app.use((request, _response, next) => {
    request.auth = {
      authType: "api-key",
      principalId: "api-key:api-key-1",
      apiKeyId: "api-key-1",
      environmentId: "environment-1",
      projectId: "project-1",
      scopes: [],
    };

    next();
  });

  app.use(apiRateLimit());

  app.get("/api/test", (_request, response) => {
    response.json({
      ok: true,
    });
  });

  app.use(errorHandler);

  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["API_RATE_LIMIT_MAX_REQUESTS"] = "2";
  process.env["API_RATE_LIMIT_WINDOW_MS"] = "60000";
});

afterEach(() => {
  if (originalMaxRequests === undefined) {
    delete process.env["API_RATE_LIMIT_MAX_REQUESTS"];
  } else {
    process.env["API_RATE_LIMIT_MAX_REQUESTS"] = originalMaxRequests;
  }

  if (originalWindowMs === undefined) {
    delete process.env["API_RATE_LIMIT_WINDOW_MS"];
  } else {
    process.env["API_RATE_LIMIT_WINDOW_MS"] = originalWindowMs;
  }

  vi.restoreAllMocks();
});

describe("apiRateLimit", () => {
  it("allows a request below the per-key limit and returns rate-limit headers", async () => {
    redis.eval.mockResolvedValue([1, 45_000]);

    const response = await httpRequest(createApp()).get("/api/test");

    expect(response.status).toBe(200);
    expect(response.headers["ratelimit-limit"]).toBe("2");
    expect(response.headers["ratelimit-remaining"]).toBe("1");
    expect(response.headers["ratelimit-reset"]).toBe("45");
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("INCR"'),
      1,
      expect.stringContaining("cascade:rate-limit:principal:api-key:api-key-1:"),
      expect.any(String),
    );
  });

  it("returns 429 after the API key exceeds its limit", async () => {
    redis.eval.mockResolvedValue([3, 12_001]);

    const response = await httpRequest(createApp()).get("/api/test");

    expect(response.status).toBe(429);
    expect(response.headers["ratelimit-limit"]).toBe("2");
    expect(response.headers["ratelimit-remaining"]).toBe("0");
    expect(response.headers["retry-after"]).toBe("13");
    expect(response.body).toEqual({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Try again later",
      },
    });
  });

  it("fails closed when Redis is unavailable", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    redis.eval.mockRejectedValue(new Error("Redis is unavailable"));

    const response = await httpRequest(createApp()).get("/api/test");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Rate limiting is temporarily unavailable",
      },
    });
  });
});
