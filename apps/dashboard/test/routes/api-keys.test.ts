import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>());

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { loader } = await import("../../app/routes/api-keys.js");

describe("API keys loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads API keys and their available permissions", async () => {
    cascadeApiRequest.mockResolvedValue({
      apiKeys: [
        {
          id: "key-1",
          name: "GitHub deploy",
          keyPrefix: "csc_dev_abc123",
          scopes: ["DEPLOYMENTS_WRITE"],
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-08-04T00:00:00.000Z",
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
    });

    const result = await loader();

    expect(cascadeApiRequest).toHaveBeenCalledWith("/api/api-keys");
    expect(result).toEqual({
      apiKeys: [
        {
          id: "key-1",
          name: "GitHub deploy",
          keyPrefix: "csc_dev_abc123",
          scopes: ["DEPLOYMENTS_WRITE"],
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-08-04T00:00:00.000Z",
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
    });
  });
});
