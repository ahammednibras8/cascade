import { createHash } from "node:crypto";

const DEFAULT_E2E_TASK_API_KEY = "csc_e2e_task_test_key";

export function getE2eTaskApiKey() {
  return process.env.E2E_TASK_API_KEY ?? DEFAULT_E2E_TASK_API_KEY;
}

function hashApiKey(apiKey: string) {
  const pepper = process.env.API_KEY_PEPPER;

  if (!pepper) {
    throw new Error("API_KEY_PEPPER is required");
  }

  return createHash("sha256").update(`${pepper}:${apiKey}`).digest("hex");
}

export async function ensureE2eTaskApiKey(environmentId: string) {
  const { prisma } = await import("@cascade/database");
  const apiKey = getE2eTaskApiKey();

  await prisma.apiKey.upsert({
    where: {
      keyHash: hashApiKey(apiKey),
    },
    update: {
      environmentId,
      name: "E2E task trigger key",
      keyPrefix: apiKey.slice(0, 16),
      revokedAt: null,
    },
    create: {
      environmentId,
      name: "E2E task trigger key",
      keyPrefix: apiKey.slice(0, 16),
      keyHash: hashApiKey(apiKey),
    },
  });

  return apiKey;
}
