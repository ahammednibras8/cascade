import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
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
    return {
      ok: false as const,
      status: 400 as const,
      error: {
        code: "INVALID_API_KEY_ID",
        message: "apiKeyId must be a UUID",
      },
    };
  }

  if (input.apiKeyId === input.auth.apiKeyId) {
    return {
      ok: false as const,
      status: 409 as const,
      error: {
        code: "CANNOT_REVOKE_CURRENT_API_KEY",
        message: "An API key cannot revoke itself",
      },
    };
  }

  const existingApiKey = await prisma.apiKey.findFirst({
    where: {
      id: input.apiKeyId,
      environmentId: input.auth.environmentId,
    },
    select: publicApiKeySelect,
  });

  if (!existingApiKey) {
    return {
      ok: false as const,
      status: 404 as const,
      error: {
        code: "API_KEY_NOT_FOUND",
        message: "API key was not found",
      },
    };
  }

  if (existingApiKey.revokedAt) {
    return {
      ok: true as const,
      status: 200 as const,
      apiKey: toPublicApiKey(existingApiKey),
    };
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

  return {
    ok: true as const,
    status: 200 as const,
    apiKey: toPublicApiKey(revokedApiKey),
  };
}
