import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ensureDashboardApiKey } from "./support/dashboard-environment.js";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const createdProjectIds: string[] = [];

async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

test.afterEach(async () => {
  const prisma = await getPrisma();
  const projectIds = createdProjectIds.splice(0);

  if (projectIds.length === 0) {
    return;
  }

  await prisma.project.deleteMany({
    where: {
      id: {
        in: projectIds,
      },
    },
  });
});

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("shows registered tasks in the dashboard table", async ({ page }) => {
  const prisma = await getPrisma();
  const suffix = randomUUID().slice(0, 8);

  const project = await prisma.project.create({
    data: {
      slug: `e2e-tasks-project-${suffix}`,
      name: "E2E Tasks Project",
      environments: {
        create: {
          slug: `e2e-tasks-dev-${suffix}`,
          name: "E2E Tasks Dev",
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
      version: `e2e-tasks-${suffix}`,
      image: "cascade-worker:e2e",
      status: "ACTIVE",
    },
  });

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      deploymentId: deployment.id,
      slug: `e2e-task-${suffix}`,
      name: "E2E Task List Task",
      description: "Visible from the task list e2e test",
    },
  });

  await prisma.taskRun.create({
    data: {
      taskId: task.id,
      deploymentId: deployment.id,
      status: "COMPLETED",
      payload: {
        source: "tasks e2e",
      },
      output: {
        ok: true,
      },
      completedAt: new Date(),
    },
  });

  await prisma.taskSchedule.create({
    data: {
      taskId: task.id,
      name: "E2E hourly schedule",
      intervalSeconds: 3600,
      nextRunAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await page.goto("/tasks");

  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  const row = page.getByRole("row").filter({
    hasText: task.slug,
  });

  await expect(row).toBeVisible();
  await expect(row).toContainText("E2E Task List Task");
  await expect(row).toContainText("Visible from the task list e2e test");
  await expect(row).toContainText(deployment.version);
  await expect(row).toContainText("ACTIVE");
  await expect(row.locator("td").nth(2)).toHaveText("1");
  await expect(row.locator("td").nth(3)).toHaveText("1");
});
