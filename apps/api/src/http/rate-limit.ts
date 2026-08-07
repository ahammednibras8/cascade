import type { RequestHandler } from "express";
import { ApiError } from "./api-error.js";
import { taskRunQueueRedis } from "../queue/task-runs.js";

const DEFAULT_MAX_REQUESTS = 300;
const DEFAULT_WINDOW_MS = 60_000;

const RATE_LIMIT_LUA = `
local count = redis.call("INCR", KEYS[1])

if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end

local ttlMs = redis.call("PTTL", KEYS[1])

return { count, ttlMs }
`;

function getPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (rawValue === undefined) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function getApiRateLimitConfig() {
  return {
    maxRequests: getPositiveIntegerEnv("API_RATE_LIMIT_MAX_REQUESTS", DEFAULT_MAX_REQUESTS),
    windowMs: getPositiveIntegerEnv("API_RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS),
  };
}

function parseRateLimitResult(result: unknown) {
  if (
    !Array.isArray(result) ||
    result.length !== 2 ||
    typeof result[0] !== "number" ||
    typeof result[1] !== "number" ||
    result[0] < 1 ||
    result[1] < 0
  ) {
    throw new Error("Redis returned an invalid rate-limit result");
  }

  return {
    count: result[0],
    ttlMs: result[1],
  };
}

export function apiRateLimit(): RequestHandler {
  const { maxRequests, windowMs } = getApiRateLimitConfig();

  return async (request, response, next) => {
    const apiKeyId = request.auth?.apiKeyId;

    if (!apiKeyId) {
      next(
        new ApiError({
          status: 500,
          code: "RATE_LIMIT_IDENTITY_MISSING",
          message: "Internal server error",
        }),
      );
      return;
    }

    const now = Date.now();
    const windowNumber = Math.floor(now / windowMs);
    const millisecondsUntilWindowEnds = windowMs - (now % windowMs);
    const redisKey = `cascade:rate-limit:api-key:${apiKeyId}:${windowNumber}`;

    try {
      const result = await taskRunQueueRedis.eval(
        RATE_LIMIT_LUA,
        1,
        redisKey,
        String(millisecondsUntilWindowEnds),
      );

      const { count, ttlMs } = parseRateLimitResult(result);
      const remaining = Math.max(0, maxRequests - count);
      const resetSeconds = Math.max(1, Math.ceil(ttlMs / 1000));

      response.set("RateLimit-Limit", String(maxRequests));
      response.set("RateLimit-Remaining", String(remaining));
      response.set("RateLimit-Reset", String(resetSeconds));

      if (count > maxRequests) {
        response.set("Retry-After", String(resetSeconds));

        next(
          new ApiError({
            status: 429,
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Try again later",
          }),
        );
        return;
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }

      next(
        new ApiError({
          status: 503,
          code: "RATE_LIMIT_UNAVAILABLE",
          message: "Rate limiting is temporarily unavailable",
        }),
      );
    }
  };
}
