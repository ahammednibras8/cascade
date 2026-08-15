import express from "express";
import httpRequest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { corsPolicy } from "../../src/http/cors-policy.js";
import { errorHandler } from "../../src/http/error-handler.js";

const originalCorsOrigins = process.env.API_CORS_ALLOWED_ORIGINS;
const originalNodeEnv = process.env.NODE_ENV;

function createApp() {
  const app = express();

  app.use(corsPolicy());

  app.get("/api/test", (_request, response) => {
    response.json({
      ok: true,
    });
  });

  app.use(errorHandler);

  return app;
}

afterEach(() => {
  if (originalCorsOrigins === undefined) {
    delete process.env.API_CORS_ALLOWED_ORIGINS;
  } else {
    process.env.API_CORS_ALLOWED_ORIGINS = originalCorsOrigins;
  }

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("corsPolicy", () => {
  it("allows a configured browser origin", async () => {
    process.env.API_CORS_ALLOWED_ORIGINS = "http://localhost:3000";

    const response = await httpRequest(createApp())
      .get("/api/test")
      .set("Origin", "http://localhost:3000");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers.vary).toContain("Origin");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("answers allowed preflight requests without requiring an API key", async () => {
    process.env.API_CORS_ALLOWED_ORIGINS = "http://localhost:3000";

    const response = await httpRequest(createApp())
      .options("/api/test")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization, content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-methods"]).toBe(
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(response.headers["access-control-allow-headers"]).toContain("X-API-Key");
  });

  it("rejects an unconfigured browser origin", async () => {
    process.env.API_CORS_ALLOWED_ORIGINS = "http://localhost:3000";

    const response = await httpRequest(createApp())
      .get("/api/test")
      .set("Origin", "https://evil.example");

    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.body).toEqual({
      error: {
        code: "CORS_ORIGIN_NOT_ALLOWED",
        message: "Request origin is not allowed",
      },
    });
  });

  it("requires explicit origins in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.API_CORS_ALLOWED_ORIGINS;

    expect(() => createApp()).toThrow("API_CORS_ALLOWED_ORIGINS is required in production");
  });
});
