import { createHash } from "node:crypto";

export const DEFAULT_E2E_DASHBOARD_API_KEY = "csc_e2e_dashboard_test_key";

export function getDashboardApiKey() {
  return process.env.CASCADE_DASHBOARD_API_KEY ?? DEFAULT_E2E_DASHBOARD_API_KEY;
}

function hashApiKey(apiKey: string) {
  const pepper = process.env.API_KEY_PEPPER;

  if (!pepper) {
    throw new Error("API_KEY_PEPPER is required");
  }

  return createHash("sha256").update(`${pepper}:${apiKey}`).digest("hex");
}

export async function ensureDashboardApiKey(environmentId: string) {
  const { prisma } = await import("@cascade/database");
  const apiKey = getDashboardApiKey();
  const keyHash = hashApiKey(apiKey);

  await prisma.apiKey.upsert({
    where: {
      keyHash,
    },
    update: {
      environmentId,
      revokedAt: null,
    },
    create: {
      environmentId,
      name: "E2E dashboard key",
      keyPrefix: apiKey.slice(0, 16),
      keyHash,
    },
  });

  return apiKey;
}

export async function getDashboardTestEnvironment() {
  const { prisma } = await import("@cascade/database");

  const project = await prisma.project.upsert({
    where: {
      slug: "e2e-dashboard",
    },
    update: {},
    create: {
      slug: "e2e-dashboard",
      name: "E2E Dashboard",
    },
  });

  const environment = await prisma.environment.upsert({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: "test",
      },
    },
    update: {},
    create: {
      projectId: project.id,
      slug: "test",
      name: "E2E Test",
      type: "DEVELOPMENT",
    },
  });

  const apiKey = await ensureDashboardApiKey(environment.id);

  return {
    project,
    environment,
    apiKey,
  };
}

async function getLocalDashboardEnvironment() {
  const { prisma } = await import("@cascade/database");

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

export async function restoreDashboardApiKey() {
  const environment = await getLocalDashboardEnvironment();

  await ensureDashboardApiKey(environment.id);
}
