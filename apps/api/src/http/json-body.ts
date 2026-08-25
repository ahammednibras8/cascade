import { getLargePayloadThresholdBytes } from "@cascade/storage";
import express from "express";
import type { Request, RequestHandler } from "express";
import { ApiError } from "./api-error.js";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

export function getJsonBodyLimitBytes() {
  const rawValue = process.env["API_JSON_BODY_LIMIT_BYTES"];

  if (!rawValue) {
    return DEFAULT_JSON_BODY_LIMIT_BYTES;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("API_JSON_BODY_LIMIT_BYTES must be a positive integer");
  }

  const largePayloadThresholdBytes = getLargePayloadThresholdBytes();

  if (value < largePayloadThresholdBytes) {
    throw new Error(
      "API_JSON_BODY_LIMIT_BYTES must be greater than or equal to LARGE_PAYLOAD_THRESHOLD_BYTES",
    );
  }

  return value;
}

function requestHasBody(request: Request) {
  const contentLength = request.get("content-length");

  if (contentLength && Number(contentLength) > 0) {
    return true;
  }

  return request.get("transfer-encoding") !== undefined;
}

export function requireJsonContentType(): RequestHandler {
  return (request, _response, next) => {
    if (!requestHasBody(request)) {
      next();
      return;
    }

    const isJson =
      request.is("application/json") !== false || request.is("application/*+json") !== false;

    if (!isJson) {
      next(
        new ApiError({
          status: 415,
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Content-Type must be application/json",
        }),
      );
      return;
    }

    next();
  };
}

export function jsonBodyParser(): RequestHandler {
  const parseJson = express.json({
    limit: getJsonBodyLimitBytes(),
    strict: true,
    type: ["application/json", "application/*+json"],
  });

  return (request, response, next) => {
    parseJson(request, response, (error) => {
      if (error) {
        next(error);
        return;
      }

      if (request.body === undefined && !requestHasBody(request)) {
        request.body = {};
      }

      next();
    });
  };
}
