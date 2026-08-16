import { prisma } from "@cascade/database";
import type { ApiAuthContext } from "../../auth/api-key.js";
import { toPublicApiKey } from "./api-key-response.js";

export async function listApiKeys(input: { auth: ApiAuthContext }) {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      environmentId: input.auth.environmentId,
    },
    orderBy: {
      createdAt: "desc",
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
    status: 200 as const,
    apiKeys: apiKeys.map(toPublicApiKey),
  };
}
