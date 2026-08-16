import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../../src/auth/api-key.js";

const apiKeyFindMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown[]>>());

vi.mock("@cascade/database", () => ({
  prisma: {
    apiKey: {
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

describe("listApiKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public API key data only for the authenticated environment", async () => {
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

    const result = await listApiKeys({ auth });

    expect(apiKeyFindMany).toHaveBeenCalledWith({
      where: {
        environmentId: "environment-1",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        rotatedFromId: true,
      },
    });

    expect(result).toEqual({
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
    });

    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("returns an empty list when the environment has no API keys", async () => {
    apiKeyFindMany.mockResolvedValue([]);

    await expect(listApiKeys({ auth })).resolves.toEqual({
      status: 200,
      apiKeys: [],
    });
  });
});
