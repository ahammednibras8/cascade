import {
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
  type ApiAuthContext,
} from "../auth/api-key.js";
import { prisma, type ApiKeyScope } from "@cascade/database";
import { isApiKeyScope } from "../auth/api-key-scopes.js";
import { toPublicApiKey } from "./api-key-response.js";

type CreateApiKeyInput = {
  auth: ApiAuthContext;
  body: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidBody(code: string, message: string) {
  return {
    ok: false as const,
    status: 400 as const,
    error: {
      code,
      message,
    },
  };
}

function parseCreateApiKeyBody(body: unknown) {
  if (!isRecord(body)) {
    return invalidBody("INVALID_BODY", "Body must be an object");
  }

  if (typeof body.name !== "string") {
    return invalidBody("INVALID_API_KEY_NAME", "name must be a non-empty string");
  }

  const name = body.name.trim();

  if (name.length === 0 || name.length > 120) {
    return invalidBody("INVALID_API_KEY_NAME", "name must be between 1 and 120 characters");
  }

  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return invalidBody("INVALID_API_KEY_SCOPES", "scopes must be a non-empty array");
  }

  const scopes: ApiKeyScope[] = [];
  const seenScopes = new Set<string>();

  for (const scope of body.scopes) {
    if (!isApiKeyScope(scope)) {
      return invalidBody("INVALID_API_KEY_SCOPE", "scopes contains an unknown permission");
    }

    if (seenScopes.has(scope)) {
      return invalidBody("INVALID_API_KEY_SCOPES", "scopes must not contain duplicates");
    }

    seenScopes.add(scope);
    scopes.push(scope);
  }

  return {
    ok: true as const,
    value: {
      name,
      scopes,
    },
  };
}

export async function createApiKey(input: CreateApiKeyInput) {
  const parsed = parseCreateApiKeyBody(input.body);

  if (!parsed.ok) {
    return parsed;
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

  const apiKey = await prisma.apiKey.create({
    data: {
      environmentId: input.auth.environmentId,
      name: parsed.value.name,
      keyPrefix: getApiKeyPrefix(token),
      keyHash: hashApiKey(token),
      scopes: parsed.value.scopes,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      rotatedFromId: true,
    },
  });

  return {
    ok: true as const,
    status: 201 as const,
    apiKey: toPublicApiKey(apiKey),
    token,
  };
}
