import type { ApiKeyScope } from "@cascade/database";

type StoredApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  rotatedFromId: string | null;
};

export type PublicApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  rotatedFromId: string | null;
};

export function toPublicApiKey(apiKey: StoredApiKey): PublicApiKey {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
    rotatedFromId: apiKey.rotatedFromId,
  };
}
