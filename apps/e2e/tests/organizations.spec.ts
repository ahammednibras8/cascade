import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const TEST_USER_EMAIL = "playwright-dashboard@example.test";

test("switches the active organization", async ({ page }) => {
  const { prisma } = await import("@cascade/database");

  const user = await prisma.user.findUniqueOrThrow({
    where: {
      email: TEST_USER_EMAIL,
    },
    select: {
      id: true,
    },
  });

  const suffix = randomUUID().slice(0, 8);
  const organization = await prisma.organization.create({
    data: {
      slug: `playwright-switch-${suffix}`,
      name: `Playwright Switch ${suffix}`,
      members: {
        create: {
          userId: user.id,
          role: "DEVELOPER",
        },
      },
    },
  });

  try {
    await page.goto("/");

    const organizationSelect = page.getByRole("combobox", {
      name: "Organization",
    });

    await organizationSelect.selectOption(organization.id);
    await page.getByRole("button", { name: "Switch organization" }).click();

    await expect(organizationSelect).toHaveValue(organization.id);
    await expect(page.locator("body")).toContainText(`Active organization: ${organization.name}`);
  } finally {
    await prisma.organization.delete({
      where: {
        id: organization.id,
      },
    });

    await prisma.$disconnect();
  }
});
