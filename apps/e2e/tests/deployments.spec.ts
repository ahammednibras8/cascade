import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ensureDashboardApiKey, restoreDashboardApiKey } from "./support/dashboard-environment.js";
import { createExecutionConfig } from "./support/execution-config.js";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const createdProjectIds: string[] = [];

async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

test.afterEach(async () => {
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
});

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("shows deployments and their worker runtime state", async ({ page }) => {
  const prisma = await getPrisma();
  const suffix = randomUUID().slice(0, 8);

  const project = await prisma.project.create({
    data: {
      slug: `e2e-deployments-project-${suffix}`,
      name: "E2E Deployments Project",
      environments: {
        create: {
          slug: `e2e-deployments-dev-${suffix}`,
          name: "E2E Deployments Dev",
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

  const deployment = await prisma.deployment.create({
    data: {
      environmentId: environment.id,
      version: `e2e-deployment-${suffix}`,
      image: "ghcr.io/cascade/example-worker:e2e",
      status: "ACTIVE",
      runtimeStatus: "RUNNING",
      runtimeStartedAt: new Date(),
    },
  });

  const executionConfig = createExecutionConfig(`e2e-deployment-task-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      deploymentId: deployment.id,
      slug: `e2e-deployment-task-${suffix}`,
      name: "E2E Deployment Task",
      executionConfig,
    },
  });

  await prisma.taskRun.create({
    data: {
      taskId: task.id,
      deploymentId: deployment.id,
      status: "COMPLETED",
      executionConfig,
      completedAt: new Date(),
    },
  });

  await page.goto("/deployments");

  await expect(page.getByRole("heading", { name: "Deployments" })).toBeVisible();

  const row = page.getByRole("row").filter({
    hasText: deployment.version,
  });

  await expect(row).toBeVisible();
  await expect(row).toContainText(deployment.id);
  await expect(row).toContainText(deployment.image);
  await expect(row).toContainText("ACTIVE");
  await expect(row).toContainText("RUNNING");
  await expect(row.locator("td").nth(4)).toHaveText("1");
  await expect(row.locator("td").nth(5)).toHaveText("1");
});
