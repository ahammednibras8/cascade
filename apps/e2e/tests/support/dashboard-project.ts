import { randomUUID } from "node:crypto";
import {
  ensureDashboardApiKey,
  getDashboardTestOrganization,
  restoreDashboardApiKey,
} from "./dashboard-environment.js";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const createdProjectIds: string[] = [];

type DashboardProjectOptions = {
  slugPrefix: string;
  projectName: string;
  environmentName: string;
};

export async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

export async function createDashboardProject({
  slugPrefix,
  projectName,
  environmentName,
}: DashboardProjectOptions) {
  const prisma = await getPrisma();
  const suffix = randomUUID().slice(0, 8);
  const organization = await getDashboardTestOrganization();

  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      slug: `${slugPrefix}-project-${suffix}`,
      name: projectName,
      environments: {
        create: {
          slug: `${slugPrefix}-dev-${suffix}`,
          name: environmentName,
          type: "DEVELOPMENT",
        },
      },
    },
    include: {
      environments: true,
    },
  });

  createdProjectIds.push(project.id);

  const environment = project.environments[0];

  if (!environment) {
    throw new Error("Expected seeded environment");
  }

  await ensureDashboardApiKey(environment.id);

  return {
    prisma,
    suffix,
    project,
    environment,
  };
}

export async function cleanupDashboardProjects() {
  const prisma = await getPrisma();
  const projectIds = createdProjectIds.splice(0);

  if (projectIds.length > 0) {
    await prisma.project.deleteMany({
      where: {
        id: {
          in: projectIds,
        },
      },
    });
  }

  await restoreDashboardApiKey();
}

export async function disconnectPrisma() {
  const prisma = await getPrisma();
  await prisma.$disconnect();
}
