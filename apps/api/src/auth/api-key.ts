import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { prisma } from "@cascade/database";

export type ApiAuthContext = {
  apiKeyId: string;
  environmentId: string;
  projectId: string;
};

const API_KEY_RANDOM_BYTES = 32;
const API_KEY_PREFIX_LENGTH = 16;

function getApiKeyPepper() {
  const pepper = process.env.API_KEY_PEPPER;

  if (!pepper) {
    throw new Error("API_KEY_PEPPER is required");
  }

  return pepper;
}

export function generateApiKey(environment = "dev") {
  const token = randomBytes(API_KEY_RANDOM_BYTES).toString("base64url");

  return `csc_${environment}_${token}`;
}

export function getApiKeyPrefix(apiKey: string) {
  return apiKey.slice(0, API_KEY_PREFIX_LENGTH);
}

export function hashApiKey(apiKey: string) {
  return createHash("sha256").update(`${getApiKeyPepper()}:${apiKey}`).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getApiKeyFromRequest(request: Request) {
  const authorization = request.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.get("x-api-key")?.trim();
}

export async function authenticateApiKey(apiKey: string): Promise<ApiAuthContext | null> {
  const keyHash = hashApiKey(apiKey);

  const storedApiKey = await prisma.apiKey.findUnique({
    where: {
      keyHash,
    },
    select: {
      id: true,
      environmentId: true,
      keyHash: true,
      revokedAt: true,
      environment: {
        select: {
          projectId: true,
        },
      },
    },
  });

  if (!storedApiKey || storedApiKey.revokedAt) {
    return null;
  }

  if (!safeEqual(storedApiKey.keyHash, keyHash)) {
    return null;
  }

  await prisma.apiKey.update({
    where: {
      id: storedApiKey.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return {
    apiKeyId: storedApiKey.id,
    environmentId: storedApiKey.environmentId,
    projectId: storedApiKey.environment.projectId,
  };
}

export function requireApiKey(): RequestHandler {
  return async (request, response, next) => {
    try {
      const apiKey = getApiKeyFromRequest(request);

      if (!apiKey) {
        response.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Missing API key",
          },
        });
        return;
      }

      const auth = await authenticateApiKey(apiKey);

      if (!auth) {
        response.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          },
        });
        return;
      }

      request.auth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}
