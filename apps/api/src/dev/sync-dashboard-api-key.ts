/* eslint-disable no-console */

import { prisma } from "@cascade/database";
import { getApiKeyPrefix, hashApiKey } from "../auth/api-key.js";

function getDashboardApiKey() {
  const apiKey = process.env.CASCADE_DASHBOARD_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("CASCADE_DASHBOARD_API_KEY is required");
  }

  return apiKey;
}

async function getLocalEnvironment() {
  const project = await prisma.project.upsert({
    where: {
      slug: "local",
    },
    update: {},
    create: {
      slug: "local",
      name: "Local Project",
    },
  });

  return prisma.environment.upsert({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: "dev",
      },
    },
    update: {},
    create: {
      projectId: project.id,
      slug: "dev",
      name: "Development",
      type: "DEVELOPMENT",
    },
  });
}

async function main() {
  const apiKey = getDashboardApiKey();
  const environment = await getLocalEnvironment();

  const storedApiKey = await prisma.apiKey.upsert({
    where: {
      keyHash: hashApiKey(apiKey),
    },
    update: {
      environmentId: environment.id,
      name: "Local dashboard key",
      keyPrefix: getApiKeyPrefix(apiKey),
      revokedAt: null,
    },
    create: {
      environmentId: environment.id,
      name: "Local dashboard key",
      keyPrefix: getApiKeyPrefix(apiKey),
      keyHash: hashApiKey(apiKey),
    },
  });

  console.log("Dashboard API key synced");
  console.log(`Environment: ${environment.slug}`);
  console.log(`API key ID: ${storedApiKey.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
