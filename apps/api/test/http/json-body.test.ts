import express from "express";
import httpRequest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { errorHandler } from "../../src/http/error-handler.js";
import {
  DEFAULT_JSON_BODY_LIMIT_BYTES,
  getJsonBodyLimitBytes,
  jsonBodyParser,
} from "../../src/http/json-body.js";
import { getLargePayloadThresholdBytes } from "@cascade/storage";

const originalJsonBodyLimit = process.env.API_JSON_BODY_LIMIT_BYTES;

function createApp() {
  const app = express();

  app.use(jsonBodyParser());

  app.post("/test", (request, response) => {
    const body = request.body as { payload?: string };

    response.json({
      payloadLength: body.payload?.length ?? 0,
    });
  });

  app.use(errorHandler);

  return app;
}

afterEach(() => {
  if (originalJsonBodyLimit === undefined) {
    delete process.env.API_JSON_BODY_LIMIT_BYTES;
    return;
  }

  process.env.API_JSON_BODY_LIMIT_BYTES = originalJsonBodyLimit;
});

describe("jsonBodyParser", () => {
  it("uses a default limit that is at least the large-payload storage threshold", () => {
    delete process.env.API_JSON_BODY_LIMIT_BYTES;

    expect(getJsonBodyLimitBytes()).toBe(DEFAULT_JSON_BODY_LIMIT_BYTES);
    expect(getJsonBodyLimitBytes()).toBeGreaterThanOrEqual(getLargePayloadThresholdBytes());
  });

  it("accepts a payload larger than the storage threshold", async () => {
    process.env.API_JSON_BODY_LIMIT_BYTES = "5242880";

    const payload = "x".repeat(300_000);

    const response = await httpRequest(createApp()).post("/test").send({
      payload,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      payloadLength: payload.length,
    });
  });

  it("returns 413 when the JSON body exceeds the configured limit", async () => {
    process.env.API_JSON_BODY_LIMIT_BYTES = "262144";

    const response = await httpRequest(createApp())
      .post("/test")
      .send({
        payload: "x".repeat(300_000),
      });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: "REQUEST_BODY_TOO_LARGE",
        message: "Request body is too large",
      },
    });
  });

  it("returns 400 when JSON is malformed", async () => {
    process.env.API_JSON_BODY_LIMIT_BYTES = "5242880";

    const response = await httpRequest(createApp())
      .post("/test")
      .set("Content-Type", "application/json")
      .send('{"payload":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
    });
  });

  it("refuses a body limit below the storage threshold", () => {
    process.env.API_JSON_BODY_LIMIT_BYTES = "262143";

    expect(() => getJsonBodyLimitBytes()).toThrow(
      "API_JSON_BODY_LIMIT_BYTES must be greater than or equal to LARGE_PAYLOAD_THRESHOLD_BYTES",
    );
  });
});
