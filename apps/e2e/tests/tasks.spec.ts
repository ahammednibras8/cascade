import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createExecutionConfig } from "./support/execution-config.js";
import { selectDashboardWorkspace } from "./support/dashboard-workspace.js";

process.env["DATABASE_URL"] ??= "postgresql://cascade:cascade@localhost:15432/cascade";

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

  const dashboardUser = await prisma.user.findUniqueOrThrow({
    where: {
      email: "playwright-dashboard@example.test",
    },
    select: {
      id: true,
    },
  });

  const organization = await prisma.organization.findFirstOrThrow({
    where: {
      members: {
        some: {
          userId: dashboardUser.id,
        },
      },
    },
    select: {
      id: true,
    },
  });

  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
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

  const taskSlug = `e2e-task-${suffix}`;
  const executionConfig = createExecutionConfig(taskSlug);

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
      slug: taskSlug,
      name: "E2E Task List Task",
      description: "Visible from the task list e2e test",
      executionConfig,
    },
  });

  const run = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      deploymentId: deployment.id,
      status: "COMPLETED",
      executionConfig,
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

  await selectDashboardWorkspace(page, environment.id);

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
  await page.getByRole("link", { name: "E2E Task List Task" }).click();

  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}$`));
  await expect(page.getByRole("heading", { name: "E2E Task List Task" })).toBeVisible();

  await expect(page.locator("body")).toContainText(task.slug);
  await expect(page.locator("body")).toContainText(task.id);
  await expect(page.locator("body")).toContainText("Visible from the task list e2e test");

  await expect(page.getByRole("heading", { name: "Execution configuration" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Schema v1");
  await expect(page.locator("body")).toContainText("Timeout 30000 ms");
  await expect(page.locator("body")).toContainText("Attempts 3");
  await expect(page.locator("body")).toContainText(`Queue ${taskSlug}`);

  await expect(page.getByRole("heading", { name: "Deployment" })).toBeVisible();
  await expect(page.getByRole("link", { name: deployment.version })).toBeVisible();
  await expect(page.locator("body")).toContainText(deployment.image);

  await expect(page.getByRole("heading", { name: "Schedules", exact: true })).toBeVisible();

  const scheduleRow = page.getByRole("row").filter({
    hasText: "E2E hourly schedule",
  });

  await expect(scheduleRow).toBeVisible();
  await expect(scheduleRow).toContainText("Every 3600 seconds");
  await expect(scheduleRow).toContainText("Enabled");

  await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();

  const runRow = page.getByRole("row").filter({
    hasText: run.id,
  });

  await expect(runRow).toBeVisible();
  await expect(runRow).toContainText("COMPLETED");
  await expect(runRow.locator("td").nth(2)).toHaveText("0");
  await expect(runRow.locator("td").nth(3)).toHaveText("0");
});
