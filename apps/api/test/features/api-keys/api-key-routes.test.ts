import httpRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApp,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "./support/api-key-route-harness.js";
import { AUTH_CONTEXT } from "../support/route-test-app.js";

const API_KEY_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-08-03T00:00:00.000Z";

function createPublicApiKey(input: Record<string, unknown> = {}) {
  return {
    id: "key-1",
    name: "GitHub deploy",
    keyPrefix: "csc_dev_abc123",
    scopes: ["DEPLOYMENTS_WRITE"],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: CREATED_AT,
    rotatedFromId: null,
    ...input,
  };
}

describe("API key routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists API keys for an API-key manager", async () => {
    listApiKeys.mockResolvedValue({
      status: 200,
      apiKeys: [createPublicApiKey()],
    });

    const response = await httpRequest(createApp()).get("/api/api-keys");

    expect(response.status).toBe(200);
    expect(listApiKeys).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
    });
    expect(response.body.apiKeys).toEqual([createPublicApiKey()]);
    expect(response.body.availableScopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "API_KEYS_MANAGE",
        }),
      ]),
    );
  });

  it("rejects API-key listing when the key lacks API_KEYS_MANAGE", async () => {
    const response = await httpRequest(createApp({ scopes: ["RUNS_READ"] })).get("/api/api-keys");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "API key is missing the required permission",
      },
    });
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it("creates an API key for an API-key manager", async () => {
    createApiKey.mockResolvedValue({
      ok: true,
      status: 201,
      apiKey: createPublicApiKey(),
      token: "csc_dev_test_token_not_a_real_secret",
    });

    const body = {
      name: "GitHub deploy",
      scopes: ["DEPLOYMENTS_WRITE"],
    };

    const response = await httpRequest(createApp()).post("/api/api-keys").send(body);

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(createApiKey).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      body,
    });
    expect(response.body).toEqual({
      apiKey: createPublicApiKey(),
      token: "csc_dev_test_token_not_a_real_secret",
    });
  });

  it("returns validation errors from API key creation", async () => {
    createApiKey.mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        code: "INVALID_API_KEY_SCOPES",
        message: "scopes must be a non-empty array",
      },
    });

    const response = await httpRequest(createApp()).post("/api/api-keys").send({
      name: "Empty scopes",
      scopes: [],
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_API_KEY_SCOPES",
        message: "scopes must be a non-empty array",
      },
    });
  });

  it("revokes an API key for an API-key manager", async () => {
    revokeApiKey.mockResolvedValue({
      ok: true,
      status: 200,
      apiKey: createPublicApiKey({
        id: API_KEY_ID,
        revokedAt: "2026-08-03T01:00:00.000Z",
      }),
    });

    const response = await httpRequest(createApp()).post(`/api/api-keys/${API_KEY_ID}/revoke`);

    expect(response.status).toBe(200);
    expect(revokeApiKey).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      apiKeyId: API_KEY_ID,
    });
    expect(response.body.apiKey).toMatchObject({
      id: API_KEY_ID,
      revokedAt: "2026-08-03T01:00:00.000Z",
    });
  });

  it("returns revoke errors from the API-key service", async () => {
    revokeApiKey.mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        code: "CANNOT_REVOKE_CURRENT_API_KEY",
        message: "An API key cannot revoke itself",
      },
    });

    const response = await httpRequest(createApp()).post(`/api/api-keys/${API_KEY_ID}/revoke`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "CANNOT_REVOKE_CURRENT_API_KEY",
        message: "An API key cannot revoke itself",
      },
    });
  });

  it("rotates an API key for an API-key manager", async () => {
    rotateApiKey.mockResolvedValue({
      ok: true,
      status: 201,
      apiKey: createPublicApiKey({
        id: "replacement-key-1",
        keyPrefix: "csc_dev_new_key",
        createdAt: "2026-08-04T00:00:00.000Z",
        rotatedFromId: API_KEY_ID,
      }),
      token: "csc_dev_test_rotation_token_not_a_real_secret",
    });

    const response = await httpRequest(createApp()).post(`/api/api-keys/${API_KEY_ID}/rotate`);

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(rotateApiKey).toHaveBeenCalledWith({
      auth: AUTH_CONTEXT,
      apiKeyId: API_KEY_ID,
    });
    expect(response.body).toEqual({
      apiKey: createPublicApiKey({
        id: "replacement-key-1",
        keyPrefix: "csc_dev_new_key",
        createdAt: "2026-08-04T00:00:00.000Z",
        rotatedFromId: API_KEY_ID,
      }),
      token: "csc_dev_test_rotation_token_not_a_real_secret",
    });
  });

  it("returns rotation errors from the API-key service", async () => {
    rotateApiKey.mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        code: "API_KEY_ALREADY_REVOKED",
        message: "A revoked API key cannot be rotated",
      },
    });

    const response = await httpRequest(createApp()).post(`/api/api-keys/${API_KEY_ID}/rotate`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "API_KEY_ALREADY_REVOKED",
        message: "A revoked API key cannot be rotated",
      },
    });
  });
});
