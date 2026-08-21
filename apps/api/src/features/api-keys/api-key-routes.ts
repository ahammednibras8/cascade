import { Router, type Router as ExpressRouter } from "express";
import { requireApiKeyScope } from "../../auth/api-key.js";
import { ApiKeyScope } from "@cascade/database";
import { authenticatedRoute, writeJsonResult } from "../../http/route-result.js";
import { listApiKeys } from "./list-api-keys.js";
import { apiKeyScopeDefinitions } from "../../auth/api-key-scopes.js";
import { createApiKey } from "./create-api-key.js";
import { getSingleParam } from "../../lib/route-params.js";
import { revokeApiKey } from "./revoke-api-key.js";
import { rotateApiKey } from "./rotate-api-key.js";

export const apikeyRoutes: ExpressRouter = Router();

apikeyRoutes.get(
  "/api-keys",
  requireApiKeyScope(ApiKeyScope.API_KEYS_MANAGE),
  authenticatedRoute(async ({ auth, response }) => {
    const result = await listApiKeys({ auth });

    response.status(result.status).json({
      apiKeys: result.apiKeys,
      availableScopes: apiKeyScopeDefinitions,
    });
  }),
);

apikeyRoutes.post(
  "/api-keys",
  requireApiKeyScope(ApiKeyScope.API_KEYS_MANAGE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await createApiKey({
      auth,
      body: request.body,
    });

    writeJsonResult(
      response,
      result,
      ({ apiKey, token }) => ({
        apiKey,
        token,
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }),
);

apikeyRoutes.post(
  "/api-keys/:apiKeyId/revoke",
  requireApiKeyScope(ApiKeyScope.API_KEYS_MANAGE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await revokeApiKey({
      auth,
      apiKeyId: getSingleParam(request.params.apiKeyId),
    });

    writeJsonResult(response, result, ({ apiKey }) => ({ apiKey }));
  }),
);

apikeyRoutes.post(
  "/api-keys/:apiKeyId/rotate",
  requireApiKeyScope(ApiKeyScope.API_KEYS_MANAGE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await rotateApiKey({
      auth,
      apiKeyId: getSingleParam(request.params.apiKeyId),
    });

    writeJsonResult(
      response,
      result,
      ({ apiKey, token }) => ({
        apiKey,
        token,
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }),
);
