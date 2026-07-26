import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const createdProjectIds: string[] = [];

async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

test.afterEach(async () => {
  const prisma = await getPrisma();

  await prisma.project.deleteMany({
    where: {
      id: {
        in: createdProjectIds.splice(0),
      },
    },
  });
});

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("shows task runs in the dashboard table", async ({ page }) => {
  const prisma = await getPrisma();
  const suffix = randomUUID().slice(0, 8);

  const project = await prisma.project.create({
    data: {
      slug: `e2e-project-${suffix}`,
      name: "E2E Project",
      environments: {
        create: {
          slug: `e2e-dev-${suffix}`,
          name: "E2E Dev",
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

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-hello-${suffix}`,
      name: "E2E Hello Task",
    },
  });

  const run = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      status: "PENDING",
      payload: {
        message: "hello from e2e",
      },
    },
  });

  await page.goto("/runs");

  await expect(page.getByRole("heading", { name: "Task runs" })).toBeVisible();

  const row = page.getByRole("row").filter({
    hasText: run.id,
  });

  await expect(row).toBeVisible();
  await expect(row).toContainText("PENDING");
  await expect(row).toContainText("E2E Hello Task");
  await expect(row).toContainText(task.slug);
  await expect(row).toContainText("E2E Project");
  await expect(row).toContainText(`${project.slug}/${environment.slug}`);
});
