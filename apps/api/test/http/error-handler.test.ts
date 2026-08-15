import express from "express";
import httpRequest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/http/api-error.js";
import { errorHandler } from "../../src/http/error-handler.js";

function createApp(error: unknown) {
  const app = express();

  app.get("/test", (_request, _response, next) => {
    next(error);
  });

  app.use(errorHandler);

  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorHandler", () => {
  it("returns a typed API error without changing its status or code", async () => {
    const response = await httpRequest(
      createApp(
        new ApiError({
          status: 409,
          code: "DEPLOYMENT_VERSION_EXISTS",
          message: "A deployment with this version already exists",
        }),
      ),
    ).get("/test");

    expect(response.status).toBe(409);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual({
      error: {
        code: "DEPLOYMENT_VERSION_EXISTS",
        message: "A deployment with this version already exists",
      },
    });
  });

  it("returns INVALID_JSON for malformed JSON parser errors", async () => {
    const error = Object.assign(new SyntaxError("Unexpected token"), {
      status: 400,
      type: "entity.parse.failed",
    });

    const response = await httpRequest(createApp(error)).get("/test");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
    });
  });

  it("returns REQUEST_BODY_TOO_LARGE for oversized request bodies", async () => {
    const error = Object.assign(new Error("Request entity too large"), {
      status: 413,
      type: "entity.too.large",
    });

    const response = await httpRequest(createApp(error)).get("/test");

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: "REQUEST_BODY_TOO_LARGE",
        message: "Request body is too large",
      },
    });
  });

  it("hides unexpected error details", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const response = await httpRequest(createApp(new Error("database password leaked"))).get(
      "/test",
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    });
  });
});
