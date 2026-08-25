import { describe, expect, it } from "vitest";
import { ListApiKeysResponseSchema, apiContracts } from "../src/index.js";

describe("API-key contracts", () => {
  it("declares the paginated API-key list endpoint", () => {
    expect(apiContracts.listApiKeys).toMatchObject({
      method: "GET",
      path: "/api/api-keys",
      kind: "list",
      retrySafety: "safe",
      pagination: "required",
      errorCodes: ["INVALID_LIST_QUERY"],
    });
  });

  it("parses a paginated API-key list response", () => {
    expect(() =>
      ListApiKeysResponseSchema.parse({
        apiKeys: [
          {
            id: "key-1",
            name: "GitHub deploy",
            keyPrefix: "csc_dev_abc123",
            scopes: ["DEPLOYMENTS_WRITE"],
            lastUsedAt: null,
            revokedAt: null,
            createdAt: "2026-08-01T10:00:00.000Z",
            rotatedFromId: null,
          },
        ],
        availableScopes: [
          {
            value: "DEPLOYMENTS_WRITE",
            label: "Create deployments",
            description: "Create a deployment and register its tasks",
          },
        ],
        pagination: {
          limit: 50,
          nextCursor: null,
          hasMore: false,
          totalCount: 1,
        },
      }),
    ).not.toThrow();
  });
});
