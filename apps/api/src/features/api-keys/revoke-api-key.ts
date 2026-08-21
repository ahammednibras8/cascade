import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success } from "../../lib/service-result.js";
import { toPublicApiKey } from "./api-key-response.js";

type RevokeApiKeyInput = {
  auth: ApiAuthContext;
  apiKeyId: string | undefined;
};

const publicApiKeySelect = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  rotatedFromId: true,
} as const;

export async function revokeApiKey(input: RevokeApiKeyInput) {
  if (!isUuid(input.apiKeyId)) {
    return failure(400, "INVALID_API_KEY_ID", "apiKeyId must be a UUID");
  }

  if (input.apiKeyId === input.auth.apiKeyId) {
    return failure(409, "CANNOT_REVOKE_CURRENT_API_KEY", "An API key cannot revoke itself");
  }

  const existingApiKey = await prisma.apiKey.findFirst({
    where: {
      id: input.apiKeyId,
      environmentId: input.auth.environmentId,
    },
    select: publicApiKeySelect,
  });

  if (!existingApiKey) {
    return failure(404, "API_KEY_NOT_FOUND", "API key was not found");
  }

  if (existingApiKey.revokedAt) {
    return success(200, {
      apiKey: toPublicApiKey(existingApiKey),
    });
  }

  const revokedApiKey = await prisma.apiKey.update({
    where: {
      id: existingApiKey.id,
    },
    data: {
      revokedAt: new Date(),
    },
    select: publicApiKeySelect,
  });

  return success(200, {
    apiKey: toPublicApiKey(revokedApiKey),
  });
}
