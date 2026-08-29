import { prisma } from "@cascade/database";

type CreatePersonalWorkspaceInput = {
  projectName: string;
  userId: string;
};

export async function createPersonalWorkspace({
  projectName: projectNameInput,
  userId,
}: CreatePersonalWorkspaceInput) {
  const projectName = projectNameInput.trim();

  if (!projectName) {
    throw new Error("Project name is required");
  }

  const organizationSlug = `personal-${userId}`;
  const projectSlug = `${organizationSlug}-project`;

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({
      where: {
        slug: organizationSlug,
      },
      select: {
        id: true,
      },
    });

    const project = await tx.project.upsert({
      where: {
        slug: projectSlug,
      },
      update: {},
      create: {
        organizationId: organization.id,
        slug: projectSlug,
        name: projectName,
      },
      select: {
        id: true,
      },
    });

    const environment = await tx.environment.upsert({
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
      select: {
        id: true,
      },
    });

    return {
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
    };
  });
}
