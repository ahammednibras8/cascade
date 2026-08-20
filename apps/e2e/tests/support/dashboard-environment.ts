const PLAYWRIGHT_ORGANIZATION_SLUG = "playwright-dashboard";

export async function getDashboardTestOrganization() {
  const { prisma } = await import("@cascade/database");

  return prisma.organization.findUniqueOrThrow({
    where: {
      slug: PLAYWRIGHT_ORGANIZATION_SLUG,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });
}

export async function getDashboardTestEnvironment() {
  const { prisma } = await import("@cascade/database");
  const organization = await getDashboardTestOrganization();

  const project = await prisma.project.upsert({
    where: {
      slug: "e2e-dashboard",
    },
    update: {
      organizationId: organization.id,
    },
    create: {
      organizationId: organization.id,
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

  return {
    project,
    environment,
  };
}
