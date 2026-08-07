import { getLargePayloadThresholdBytes } from "@cascade/storage";
import express, { type RequestHandler } from "express";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

export function getJsonBodyLimitBytes() {
  const rawValue = process.env.API_JSON_BODY_LIMIT_BYTES;

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

export function jsonBodyParser(): RequestHandler {
  return express.json({
    limit: getJsonBodyLimitBytes(),
    strict: true,
  });
}
