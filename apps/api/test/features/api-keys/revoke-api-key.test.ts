import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const apiKeyFindFirst = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const apiKeyUpdate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

vi.mock("@cascade/database", () => ({
  prisma: {
    apiKey: {
      findFirst: apiKeyFindFirst,
      update: apiKeyUpdate,
    },
  },
}));

const { revokeApiKey } = await import("../../../src/features/api-keys/revoke-api-key.js");

const auth = {
  apiKeyId: "11111111-1111-4111-8111-111111111111",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: ["API_KEYS_MANAGE"],
} satisfies ApiAuthContext;

const targetApiKeyId = "22222222-2222-4222-8222-222222222222";

function createStoredApiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: targetApiKeyId,
    name: "GitHub deploy",
    keyPrefix: "csc_dev_abc123",
    scopes: ["DEPLOYMENTS_WRITE"],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-08-03T00:00:00.000Z"),
    rotatedFromId: null,
    ...overrides,
  };
}

describe("revokeApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid API key id before querying the database", async () => {
    const result = await revokeApiKey({
      auth,
      apiKeyId: "not-a-uuid",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_API_KEY_ID",
        message: "apiKeyId must be a UUID",
      },
    });
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("does not allow the acting API key to revoke itself", async () => {
    const result = await revokeApiKey({
      auth,
      apiKeyId: auth.apiKeyId,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "CANNOT_REVOKE_CURRENT_API_KEY",
        message: "An API key cannot revoke itself",
      },
    });
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("does not reveal whether an API key exists in another environment", async () => {
    apiKeyFindFirst.mockResolvedValue(null);

    const result = await revokeApiKey({
      auth,
      apiKeyId: targetApiKeyId,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: {
        code: "API_KEY_NOT_FOUND",
        message: "API key was not found",
      },
    });

    expect(apiKeyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: targetApiKeyId,
          environmentId: "environment-1",
        },
      }),
    );
    expect(apiKeyUpdate).not.toHaveBeenCalled();
  });

  it("revokes an active API key", async () => {
    apiKeyFindFirst.mockResolvedValue(createStoredApiKey());

    apiKeyUpdate.mockResolvedValue(
      createStoredApiKey({
        revokedAt: new Date("2026-08-03T01:00:00.000Z"),
      }),
    );

    const result = await revokeApiKey({
      auth,
      apiKeyId: targetApiKeyId,
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      apiKey: {
        id: targetApiKeyId,
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: null,
        revokedAt: "2026-08-03T01:00:00.000Z",
        createdAt: "2026-08-03T00:00:00.000Z",
        rotatedFromId: null,
      },
    });

    expect(apiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: targetApiKeyId,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      }),
    );
  });

  it("treats revoking an already revoked key as successful", async () => {
    apiKeyFindFirst.mockResolvedValue(
      createStoredApiKey({
        revokedAt: new Date("2026-08-03T01:00:00.000Z"),
      }),
    );

    const result = await revokeApiKey({
      auth,
      apiKeyId: targetApiKeyId,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      apiKey: {
        id: targetApiKeyId,
        revokedAt: "2026-08-03T01:00:00.000Z",
      },
    });

    expect(apiKeyUpdate).not.toHaveBeenCalled();
  });
});
