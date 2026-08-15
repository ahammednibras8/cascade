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

test("opens deployment detail and shows its registered task configuration", async ({ page }) => {
  const prisma = await getPrisma();
  const suffix = randomUUID().slice(0, 8);

  const project = await prisma.project.create({
    data: {
      slug: `e2e-deployment-detail-project-${suffix}`,
      name: "E2E Deployment Detail Project",
      environments: {
        create: {
          slug: `e2e-deployment-detail-dev-${suffix}`,
          name: "E2E Deployment Detail Dev",
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
      version: `e2e-detail-${suffix}`,
      image: "ghcr.io/cascade/detail-worker:e2e",
      status: "ACTIVE",
      runtimeStatus: "FAILED",
      runtimeError: "Worker image could not start",
      runtimeStartedAt: new Date("2026-08-16T10:00:00.000Z"),
      runtimeStoppedAt: new Date("2026-08-16T10:05:00.000Z"),
    },
  });

  const executionConfig = createExecutionConfig(`e2e-detail-task-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      deploymentId: deployment.id,
      slug: `e2e-detail-task-${suffix}`,
      name: "E2E Deployment Detail Task",
      description: "Visible in deployment detail",
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

  await prisma.taskSchedule.create({
    data: {
      taskId: task.id,
      name: `E2E detail schedule ${suffix}`,
      intervalSeconds: 3_600,
      nextRunAt: new Date(Date.now() + 3_600_000),
    },
  });

  await page.goto("/deployments");

  await page.getByRole("link", { name: deployment.version }).click();

  await expect(page).toHaveURL(new RegExp(`/deployments/${deployment.id}$`));
  await expect(page.getByRole("heading", { name: "Deployment detail" })).toBeVisible();

  await expect(page.locator("body")).toContainText(deployment.id);
  await expect(page.locator("body")).toContainText(deployment.image);
  await expect(page.locator("body")).toContainText("ACTIVE");
  await expect(page.locator("body")).toContainText("FAILED");
  await expect(page.locator("body")).toContainText("Worker image could not start");

  const taskRow = page.getByRole("row").filter({
    hasText: task.slug,
  });

  await expect(taskRow).toBeVisible();
  await expect(taskRow).toContainText("E2E Deployment Detail Task");
  await expect(taskRow).toContainText("Visible in deployment detail");
  await expect(taskRow).toContainText("Attempts 3");
  await expect(taskRow).toContainText("Queue");
  await expect(taskRow.locator("td").nth(2)).toHaveText("1");
  await expect(taskRow.locator("td").nth(3)).toHaveText("1");
});
