import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const TEST_USER_EMAIL = "playwright-dashboard@example.test";

test("switches the active project and environment", async ({ page }) => {
  const { prisma } = await import("@cascade/database");

  const user = await prisma.user.findUniqueOrThrow({
    where: {
      email: TEST_USER_EMAIL,
    },
    select: {
      id: true,
    },
  });

  const organization = await prisma.organization.findFirstOrThrow({
    where: {
      members: {
        some: {
          userId: user.id,
        },
      },
    },
    select: {
      id: true,
    },
  });

  const suffix = randomUUID().slice(0, 8);
  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      slug: `playwright-workspace-${suffix}`,
      name: `Playwright Workspace ${suffix}`,
      environments: {
        create: {
          slug: "staging",
          name: "Staging",
          type: "STAGING",
        },
      },
    },
    include: {
      environments: true,
    },
  });

  const environment = project.environments[0];

  if (!environment) {
    throw new Error("Expected the E2E project environment");
  }

  try {
    await page.goto("/");

    const workspaceSelect = page.getByRole("combobox", {
      name: "Project and environment",
    });

    await workspaceSelect.selectOption(environment.id);
    await page.getByRole("button", { name: "Switch workspace" }).click();

    await expect(workspaceSelect).toHaveValue(environment.id);
    await expect(page.locator("body")).toContainText(`Active project: ${project.name}`);
    await expect(page.locator("body")).toContainText("Active environment: Staging");
  } finally {
    await prisma.project.delete({
      where: {
        id: project.id,
      },
    });

    await prisma.$disconnect();
  }
});
