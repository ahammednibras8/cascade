import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  apiKey: {
    findUnique: vi.fn<(args: unknown) => Promise<unknown>>(),
    updateMany: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { hashApiKey, requireApiKeyWhenUnauthenticated } = await import("../../src/auth/api-key.js");

function createApp() {
  const app = express();

  app.use(requireApiKeyWhenUnauthenticated());

  app.get("/protected", (req, response) => {
    response.json({
      auth: req.auth,
    });
  });

  return app;
}

describe("API key auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env["API_KEY_PEPPER"] = "test-api-key-pepper";

    prisma.apiKey.updateMany.mockResolvedValue({ count: 1 });
  });

  it("rejects requests without an API key", async () => {
    const app = createApp();

    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing API authentication",
      },
    });

    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("rejects invalid API keys", async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);

    const app = createApp();

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer csc_dev_invalid");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid API key",
      },
    });

    expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
  });

  it("rejects revoked API keys", async () => {
    const apiKey = "csc_dev_valid_but_revoked";
    const keyHash = hashApiKey(apiKey);

    prisma.apiKey.findUnique.mockResolvedValue({
      id: "api-key-1",
      environmentId: "environment-1",
      keyHash,
      revokedAt: new Date(),
      environment: {
        projectId: "project-1",
      },
    });

    const app = createApp();

    const response = await request(app).get("/protected").set("Authorization", `Bearer ${apiKey}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid API key",
      },
    });

    expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
  });

  it("accepts a valid bearer API key and sets auth context", async () => {
    const apiKey = "csc_dev_valid_bearer";
    const keyHash = hashApiKey(apiKey);

    prisma.apiKey.findUnique.mockResolvedValue({
      id: "api-key-1",
      environmentId: "environment-1",
      keyHash,
      revokedAt: null,
      scopes: ["RUNS_READ"],
      environment: {
        projectId: "project-1",
      },
    });

    const app = createApp();

    const response = await request(app).get("/protected").set("Authorization", `Bearer ${apiKey}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      auth: {
        authType: "api-key",
        principalId: "api-key:api-key-1",
        apiKeyId: "api-key-1",
        environmentId: "environment-1",
        projectId: "project-1",
        scopes: ["RUNS_READ"],
      },
    });

    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: {
        id: "api-key-1",
        revokedAt: null,
      },
      data: {
        lastUsedAt: expect.any(Date),
      },
    });
  });

  it("accepts a valid x-api-key header", async () => {
    const apiKey = "csc_dev_valid_header";
    const keyHash = hashApiKey(apiKey);

    prisma.apiKey.findUnique.mockResolvedValue({
      id: "api-key-2",
      environmentId: "environment-2",
      keyHash,
      revokedAt: null,
      scopes: ["RUNS_READ"],
      environment: {
        projectId: "project-2",
      },
    });

    const app = createApp();

    const response = await request(app).get("/protected").set("x-api-key", apiKey);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      auth: {
        authType: "api-key",
        principalId: "api-key:api-key-2",
        apiKeyId: "api-key-2",
        environmentId: "environment-2",
        projectId: "project-2",
        scopes: ["RUNS_READ"],
      },
    });
  });
});
