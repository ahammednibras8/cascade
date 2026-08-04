import { Router, type Router as ExpressRouter } from "express";
import { requireApiKeyScope } from "../auth/api-key.js";
import { ApiKeyScope } from "@cascade/database";
import { asyncHandler } from "../http/async-handler.js";
import { getAuthOrRespond } from "./route-auth.js";
import { listApiKeys } from "../services/list-api-keys.js";
import { apiKeyScopeDefinitions } from "../auth/api-key-scopes.js";
import { createApiKey } from "../services/create-api-key.js";
import { getSingleParam } from "../lib/route-params.js";
import { revokeApiKey } from "../services/revoke-api-key.js";
import { rotateApiKey } from "../services/rotate-api-key.js";

export const apikeyRoutes: ExpressRouter = Router();

apikeyRoutes.get(
  "/api-keys",
  requireApiKeyScope(ApiKeyScope.API_KEYS_MANAGE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

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
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await createApiKey({
      auth,
      body: request.body,
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).set("Cache-Control", "no-store").json({
      apiKey: result.apiKey,
      token: result.token,
    });
  }),
);

apikeyRoutes.post(
  "/api-keys/:apiKeyId/revoke",
  requireApiKeyScope(ApiKeyScope.API_KEYS_MANAGE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await revokeApiKey({
      auth,
      apiKeyId: getSingleParam(request.params.apiKeyId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).json({
      apiKey: result.apiKey,
    });
  }),
);

apikeyRoutes.post(
  "/api-keys/:apiKeyId/rotate",
  requireApiKeyScope(ApiKeyScope.API_KEYS_MANAGE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await rotateApiKey({
      auth,
      apiKeyId: getSingleParam(request.params.apiKeyId),
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).set("Cache-Control", "no-store").json({
      apiKey: result.apiKey,
      token: result.token,
    });
  }),
);
