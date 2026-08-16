import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const environmentFindUniqueOrThrow = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const apiKeyCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

vi.mock("@cascade/database", () => ({
  ApiKeyScope: {
    TASKS_READ: "TASKS_READ",
    TASKS_TRIGGER: "TASKS_TRIGGER",
    SCHEDULES_WRITE: "SCHEDULES_WRITE",
    RUNS_READ: "RUNS_READ",
    RUNS_CANCEL: "RUNS_CANCEL",
    RUNS_REPLAY: "RUNS_REPLAY",
    DEPLOYMENTS_WRITE: "DEPLOYMENTS_WRITE",
    API_KEYS_MANAGE: "API_KEYS_MANAGE",
  },
  prisma: {
    environment: {
      findUniqueOrThrow: environmentFindUniqueOrThrow,
    },
    apiKey: {
      create: apiKeyCreate,
    },
  },
}));

const { hashApiKey } = await import("../../../src/auth/api-key.js");
const { createApiKey } = await import("../../../src/features/api-keys/create-api-key.js");

const auth = {
  apiKeyId: "manager-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: ["API_KEYS_MANAGE"],
} satisfies ApiAuthContext;

describe("createApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.API_KEY_PEPPER = "test-api-key-pepper";

    environmentFindUniqueOrThrow.mockResolvedValue({
      slug: "dev",
    });

    apiKeyCreate.mockResolvedValue({
      id: "key-1",
      name: "GitHub deploy",
      keyPrefix: "csc_dev_abc123",
      scopes: ["DEPLOYMENTS_WRITE"],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      rotatedFromId: null,
    });
  });

  it("creates a hashed API key and returns its token once", async () => {
    const result = await createApiKey({
      auth,
      body: {
        name: "  GitHub deploy  ",
        scopes: ["DEPLOYMENTS_WRITE"],
      },
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected API key creation to succeed");
    }

    expect(result.status).toBe(201);
    expect(result.token).toMatch(/^csc_dev_/);
    expect(result.apiKey).toEqual({
      id: "key-1",
      name: "GitHub deploy",
      keyPrefix: "csc_dev_abc123",
      scopes: ["DEPLOYMENTS_WRITE"],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-08-03T00:00:00.000Z",
      rotatedFromId: null,
    });

    expect(environmentFindUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        id: "environment-1",
      },
      select: {
        slug: true,
      },
    });

    expect(apiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          environmentId: "environment-1",
          name: "GitHub deploy",
          keyHash: hashApiKey(result.token),
          scopes: ["DEPLOYMENTS_WRITE"],
        }),
      }),
    );

    expect(JSON.stringify(result.apiKey)).not.toContain(result.token);
  });

  it("rejects unknown scopes without querying the database", async () => {
    const result = await createApiKey({
      auth,
      body: {
        name: "Bad key",
        scopes: ["NOT_A_REAL_SCOPE"],
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_API_KEY_SCOPE",
        message: "scopes contains an unknown permission",
      },
    });

    expect(environmentFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });

  it("rejects duplicate scopes without querying the database", async () => {
    const result = await createApiKey({
      auth,
      body: {
        name: "Duplicate scope key",
        scopes: ["RUNS_READ", "RUNS_READ"],
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_API_KEY_SCOPES",
        message: "scopes must not contain duplicates",
      },
    });

    expect(environmentFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });
});
