import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";
import { ListApiKeysResponseSchema } from "@cascade/api-contracts";

const apiKeyCount = vi.hoisted(() => vi.fn<(args: unknown) => Promise<number>>());
const apiKeyFindMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown[]>>());

vi.mock("@cascade/database", () => ({
  prisma: {
    apiKey: {
      count: apiKeyCount,
      findMany: apiKeyFindMany,
    },
  },
}));

const { listApiKeys } = await import("../../../src/features/api-keys/list-api-keys.js");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listApiKeys success responses", () => {
  it("returns public API key data only for the authenticated environment", async () => {
    apiKeyCount.mockResolvedValue(1);
    apiKeyFindMany.mockResolvedValue([
      {
        id: "key-1",
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        keyHash: "must-not-leak",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: new Date("2026-08-03T10:00:00.000Z"),
        revokedAt: null,
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        rotatedFromId: null,
      },
    ]);

    const result = await listApiKeys({ auth, query: {} });

    expect(apiKeyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          environmentId: "environment-1",
        },
        select: expect.not.objectContaining({
          keyHash: true,
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      status: 200,
      apiKeys: [
        {
          id: "key-1",
          name: "GitHub deploy",
          keyPrefix: "csc_dev_abc123",
          scopes: ["DEPLOYMENTS_WRITE"],
          lastUsedAt: "2026-08-03T10:00:00.000Z",
          revokedAt: null,
          createdAt: "2026-08-01T10:00:00.000Z",
          rotatedFromId: null,
        },
      ],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      },
    });
    if (!result.ok) {
      throw new Error("Expected listApiKeys to succeed");
    }

    expect(() =>
      ListApiKeysResponseSchema.parse({
        apiKeys: result.apiKeys,
        availableScopes: [
          {
            value: "DEPLOYMENTS_WRITE",
            label: "Create deployments",
            description: "Create a deployment and register its tasks",
          },
        ],
        pagination: result.pagination,
      }),
    ).not.toThrow();

    expect(apiKeyCount).toHaveBeenCalledWith({
      where: {
        environmentId: "environment-1",
      },
    });

    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("returns an empty list when the environment has no API keys", async () => {
    apiKeyCount.mockResolvedValue(0);
    apiKeyFindMany.mockResolvedValue([]);

    await expect(listApiKeys({ auth, query: {} })).resolves.toEqual({
      ok: true,
      status: 200,
      apiKeys: [],
      pagination: {
        limit: 50,
        nextCursor: null,
        hasMore: false,
        totalCount: 0,
      },
    });
  });
});

describe("listApiKeys query filters", () => {
  it("filters revoked API keys and requests one extra record", async () => {
    apiKeyCount.mockResolvedValue(0);
    apiKeyFindMany.mockResolvedValue([]);

    await expect(
      listApiKeys({
        auth,
        query: {
          limit: "25",
          revoked: "true",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 200,
      pagination: {
        limit: 25,
        hasMore: false,
        totalCount: 0,
      },
    });

    expect(apiKeyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          environmentId: "environment-1",
          revokedAt: {
            not: null,
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 26,
      }),
    );
  });

  it("rejects invalid API-key list filters without querying Prisma", async () => {
    await expect(
      listApiKeys({
        auth,
        query: {
          revoked: "yes",
        },
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_LIST_QUERY",
        message: "revoked must be either true or false",
      },
    });

    expect(apiKeyFindMany).not.toHaveBeenCalled();
    expect(apiKeyCount).not.toHaveBeenCalled();
  });
});
