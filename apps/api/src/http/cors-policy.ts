import type { RequestHandler } from "express";
import { ApiError } from "./api-error.js";

const DEFAULT_DEVELOPMENT_ORIGINS = ["http://localhost:3000"];

const ALLOWED_METHODS = ["GET", "POST", "OPTIONS"];

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "Traceparent",
  "X-API-Key",
];

function validateOrigin(value: string) {
  const parsed = new URL(value);

  if (parsed.origin !== value) {
    throw new Error(
      "API_CORS_ALLOWED_ORIGINS entries must be origins only, for example https://dashboard.example.com",
    );
  }

  return value;
}

export function getAllowedCorsOrigins() {
  const rawValue = process.env.API_CORS_ALLOWED_ORIGINS;

  if (!rawValue) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("API_CORS_ALLOWED_ORIGINS is required in production");
    }

    return DEFAULT_DEVELOPMENT_ORIGINS;
  }

  const origins = rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(validateOrigin);

  if (origins.length === 0) {
    throw new Error("API_CORS_ALLOWED_ORIGINS must contain at least one origin");
  }

  return origins;
}

export function corsPolicy(): RequestHandler {
  const allowedOrigins = new Set(getAllowedCorsOrigins());

  return (request, response, next) => {
    const origin = request.get("Origin");

    if (!origin) {
      next();
      return;
    }

    if (!allowedOrigins.has(origin)) {
      next(
        new ApiError({
          status: 403,
          code: "CORS_ORIGIN_NOT_ALLOWED",
          message: "Request origin is not allowed",
        }),
      );
      return;
    }

    response.vary("Origin");
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Access-Control-Allow-Methods", ALLOWED_METHODS.join(", "));
    response.set("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
    response.set("Access-Control-Max-Age", "600");

    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }

    next();
  };
}
