import { prisma } from "@cascade/database";
import {
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
  type ApiAuthContext,
} from "../../auth/api-key.js";
import { isUuid } from "../../lib/route-params.js";
import { failure, success } from "../../lib/service-result.js";
import { toPublicApiKey } from "./api-key-response.js";

type RotateApiKeyInput = {
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

export async function rotateApiKey(input: RotateApiKeyInput) {
  if (!isUuid(input.apiKeyId)) {
    return failure(400, "INVALID_API_KEY_ID", "apiKeyId must be a UUID");
  }

  if (input.apiKeyId === input.auth.apiKeyId) {
    return failure(409, "CANNOT_ROTATE_CURRENT_API_KEY", "An API key cannot rotate itself");
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
    return failure(409, "API_KEY_ALREADY_REVOKED", "A revoked API key cannot be rotated");
  }

  const environment = await prisma.environment.findUniqueOrThrow({
    where: {
      id: input.auth.environmentId,
    },
    select: {
      slug: true,
    },
  });

  const token = generateApiKey(environment.slug);

  const rotatedApiKey = await prisma.$transaction(async (tx) => {
    const revokeResult = await tx.apiKey.updateMany({
      where: {
        id: existingApiKey.id,
        environmentId: input.auth.environmentId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (revokeResult.count !== 1) {
      return null;
    }

    return tx.apiKey.create({
      data: {
        environmentId: input.auth.environmentId,
        name: existingApiKey.name,
        keyPrefix: getApiKeyPrefix(token),
        keyHash: hashApiKey(token),
        scopes: existingApiKey.scopes,
        rotatedFromId: existingApiKey.id,
      },
      select: publicApiKeySelect,
    });
  });

  if (!rotatedApiKey) {
    return failure(409, "API_KEY_ALREADY_REVOKED", "A revoked API key cannot be rotated");
  }

  return success(201, {
    apiKey: toPublicApiKey(rotatedApiKey),
    token,
  });
}
