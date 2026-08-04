import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() =>
  vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
);

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { action, loader } = await import("../../app/routes/api-keys.js");

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

  it("creates an API key through the dashboard server action", async () => {
    cascadeApiRequest.mockResolvedValue({
      apiKey: {
        id: "key-1",
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: "2026-08-04T00:00:00.000Z",
        rotatedFromId: null,
      },
      token: "csc_dev_test_token_not_a_real_secret",
    });

    const formData = new URLSearchParams([
      ["intent", "create"],
      ["name", "GitHub deploy"],
      ["scope", "DEPLOYMENTS_WRITE"],
    ]);

    const response = await action({
      request: new Request("http://dashboard.test/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      }),
    } as never);

    expect(cascadeApiRequest).toHaveBeenCalledWith("/api/api-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "GitHub deploy",
        scopes: ["DEPLOYMENTS_WRITE"],
      }),
    });

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      apiKey: {
        id: "key-1",
        name: "GitHub deploy",
        keyPrefix: "csc_dev_abc123",
        scopes: ["DEPLOYMENTS_WRITE"],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: "2026-08-04T00:00:00.000Z",
        rotatedFromId: null,
      },
      token: "csc_dev_test_token_not_a_real_secret",
    });
  });

  it("rejects unknown dashboard actions before calling the API", async () => {
    const response = await action({
      request: new Request("http://dashboard.test/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams([["intent", "delete"]]),
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_ACTION",
        message: "Unsupported API key action",
      },
    });
    expect(cascadeApiRequest).not.toHaveBeenCalled();
  });
});
