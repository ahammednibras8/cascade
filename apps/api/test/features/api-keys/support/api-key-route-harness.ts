import { vi } from "vitest";
import type { ApiKeyScope } from "@cascade/database";
import { createRouteTestApp } from "../../support/route-test-app.js";

const databaseMock = vi.hoisted(() => ({
  ApiKeyScope: {
    API_KEYS_MANAGE: "API_KEYS_MANAGE",
  },
}));

const apiKeyRouteMocks = vi.hoisted(() => ({
  createApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
  listApiKeys: vi.fn<(input: unknown) => Promise<unknown>>(),
  revokeApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
  rotateApiKey: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

export const { createApiKey, listApiKeys, revokeApiKey, rotateApiKey } = apiKeyRouteMocks;

vi.mock("@cascade/database", () => databaseMock);

vi.mock("../../../../src/features/api-keys/create-api-key.js", () => ({
  createApiKey: apiKeyRouteMocks.createApiKey,
}));

vi.mock("../../../../src/features/api-keys/list-api-keys.js", () => ({
  listApiKeys: apiKeyRouteMocks.listApiKeys,
}));

vi.mock("../../../../src/features/api-keys/revoke-api-key.js", () => ({
  revokeApiKey: apiKeyRouteMocks.revokeApiKey,
}));

vi.mock("../../../../src/features/api-keys/rotate-api-key.js", () => ({
  rotateApiKey: apiKeyRouteMocks.rotateApiKey,
}));

const { apikeyRoutes } = await import("../../../../src/features/api-keys/api-key-routes.js");

export function createApp(input: { scopes?: ApiKeyScope[] } = {}) {
  return createRouteTestApp(apikeyRoutes, input);
}
