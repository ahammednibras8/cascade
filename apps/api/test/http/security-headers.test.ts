import express from "express";
import httpRequest from "supertest";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "../../src/http/security-headers.js";

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders());

  app.get("/healthz", (_request, response) => {
    response.json({
      ok: true,
    });
  });

  return app;
}

describe("securityHeaders", () => {
  it("sets API security headers", async () => {
    const response = await httpRequest(createApp()).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});
