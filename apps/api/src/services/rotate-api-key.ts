import { prisma } from "@cascade/database";
import {
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
  type ApiAuthContext,
} from "../auth/api-key.js";
import { isUuid } from "../lib/route-params.js";
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
        code: "CANNOT_ROTATE_CURRENT_API_KEY",
        message: "An API key cannot rotate itself",
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
      ok: false as const,
      status: 409 as const,
      error: {
        code: "API_KEY_ALREADY_REVOKED",
        message: "A revoked API key cannot be rotated",
      },
    };
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
    return {
      ok: false as const,
      status: 409 as const,
      error: {
        code: "API_KEY_ALREADY_REVOKED",
        message: "A revoked API key cannot be rotated",
      },
    };
  }

  return {
    ok: true as const,
    status: 201 as const,
    apiKey: toPublicApiKey(rotatedApiKey),
    token,
  };
}
