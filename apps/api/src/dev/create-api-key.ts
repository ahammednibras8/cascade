/* eslint-disable no-console */

import { prisma } from "@cascade/database";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "../auth/api-key.js";

async function main() {
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

  const environment = await prisma.environment.upsert({
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

  const apiKey = generateApiKey(environment.slug);

  const storedApiKey = await prisma.apiKey.create({
    data: {
      environmentId: environment.id,
      name: "Local development key",
      keyPrefix: getApiKeyPrefix(apiKey),
      keyHash: hashApiKey(apiKey),
    },
  });

  console.log("Created API key");
  console.log(`Project: ${project.slug}`);
  console.log(`Environment: ${environment.slug}`);
  console.log(`API key ID: ${storedApiKey.id}`);
  console.log("");
  console.log(apiKey);
  console.log("");
  console.log("Store this key now. It cannot be recovered later.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
