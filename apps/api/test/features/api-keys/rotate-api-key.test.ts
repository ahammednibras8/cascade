import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const apiKeyFindFirst = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const environmentFindUniqueOrThrow = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const txApiKeyUpdateMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<{ count: number }>>());

const txApiKeyCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const transaction = vi.hoisted(() =>
  vi.fn<(callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>>(),
);

vi.mock("@cascade/database", () => ({
  prisma: {
    apiKey: {
      findFirst: apiKeyFindFirst,
    },
    environment: {
      findUniqueOrThrow: environmentFindUniqueOrThrow,
    },
    $transaction: transaction,
  },
}));

const { hashApiKey } = await import("../../../src/auth/api-key.js");
const { rotateApiKey } = await import("../../../src/features/api-keys/rotate-api-key.js");

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
    keyPrefix: "csc_dev_old_key",
    scopes: ["DEPLOYMENTS_WRITE"],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-08-03T00:00:00.000Z"),
    rotatedFromId: null,
    ...overrides,
  };
}

describe("rotateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env["API_KEY_PEPPER"] = "test-api-key-pepper";

    apiKeyFindFirst.mockResolvedValue(createStoredApiKey());

    environmentFindUniqueOrThrow.mockResolvedValue({
      slug: "dev",
    });

    transaction.mockImplementation(async (callback) =>
      callback({
        apiKey: {
          updateMany: txApiKeyUpdateMany,
          create: txApiKeyCreate,
        },
      }),
    );

    txApiKeyUpdateMany.mockResolvedValue({
      count: 1,
    });

    txApiKeyCreate.mockResolvedValue({
      id: "replacement-key-1",
      name: "GitHub deploy",
      keyPrefix: "csc_dev_new_key",
      scopes: ["DEPLOYMENTS_WRITE"],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date("2026-08-04T00:00:00.000Z"),
      rotatedFromId: targetApiKeyId,
    });
  });

  it("creates a replacement key and revokes the old key atomically", async () => {
    const result = await rotateApiKey({
      auth,
      apiKeyId: targetApiKeyId,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected API key rotation to succeed");
    }

    expect(result.status).toBe(201);
    expect(result.token).toMatch(/^csc_dev_/);
    expect(result.apiKey).toEqual({
      id: "replacement-key-1",
      name: "GitHub deploy",
      keyPrefix: "csc_dev_new_key",
      scopes: ["DEPLOYMENTS_WRITE"],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-08-04T00:00:00.000Z",
      rotatedFromId: targetApiKeyId,
    });

    expect(txApiKeyUpdateMany).toHaveBeenCalledWith({
      where: {
        id: targetApiKeyId,
        environmentId: "environment-1",
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });

    expect(txApiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          environmentId: "environment-1",
          name: "GitHub deploy",
          scopes: ["DEPLOYMENTS_WRITE"],
          rotatedFromId: targetApiKeyId,
          keyHash: hashApiKey(result.token),
        }),
      }),
    );
  });

  it("does not allow the acting API key to rotate itself", async () => {
    const result = await rotateApiKey({
      auth,
      apiKeyId: auth.apiKeyId,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "CANNOT_ROTATE_CURRENT_API_KEY",
        message: "An API key cannot rotate itself",
      },
    });

    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("does not rotate a key that was already revoked", async () => {
    apiKeyFindFirst.mockResolvedValue(
      createStoredApiKey({
        revokedAt: new Date("2026-08-04T01:00:00.000Z"),
      }),
    );

    const result = await rotateApiKey({
      auth,
      apiKeyId: targetApiKeyId,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "API_KEY_ALREADY_REVOKED",
        message: "A revoked API key cannot be rotated",
      },
    });

    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not create a replacement when another request revoked the key first", async () => {
    txApiKeyUpdateMany.mockResolvedValue({
      count: 0,
    });

    const result = await rotateApiKey({
      auth,
      apiKeyId: targetApiKeyId,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "API_KEY_ALREADY_REVOKED",
        message: "A revoked API key cannot be rotated",
      },
    });

    expect(txApiKeyCreate).not.toHaveBeenCalled();
  });
});
