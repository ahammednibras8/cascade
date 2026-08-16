import { expect, test } from "@playwright/test";
import {
  cleanupDashboardProjects,
  createDashboardProject,
  disconnectPrisma,
} from "./support/dashboard-project.js";
import { createExecutionConfig } from "./support/execution-config.js";

test.afterEach(cleanupDashboardProjects);
test.afterAll(disconnectPrisma);

test("shows deployments and their worker runtime state", async ({ page }) => {
  const { environment, prisma, suffix } = await createDashboardProject({
    slugPrefix: "e2e-deployments",
    projectName: "E2E Deployments Project",
    environmentName: "E2E Deployments Dev",
  });

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
  const { environment, prisma, suffix } = await createDashboardProject({
    slugPrefix: "e2e-deployment-detail",
    projectName: "E2E Deployment Detail Project",
    environmentName: "E2E Deployment Detail Dev",
  });

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

test("dashboard deactivates a deployment and disables its tasks and schedules", async ({
  page,
}) => {
  const { environment, prisma, suffix } = await createDashboardProject({
    slugPrefix: "e2e-deactivate-deployment",
    projectName: "E2E Deactivate Deployment Project",
    environmentName: "E2E Deactivate Deployment Dev",
  });

  const deployment = await prisma.deployment.create({
    data: {
      environmentId: environment.id,
      version: `e2e-deactivate-${suffix}`,
      image: "ghcr.io/cascade/deactivate-worker:e2e",
      status: "ACTIVE",
      runtimeStatus: "RUNNING",
    },
  });

  const executionConfig = createExecutionConfig(`e2e-deactivate-task-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      deploymentId: deployment.id,
      slug: `e2e-deactivate-task-${suffix}`,
      name: "E2E Deactivate Task",
      executionConfig,
    },
  });

  const schedule = await prisma.taskSchedule.create({
    data: {
      taskId: task.id,
      name: `E2E deactivate schedule ${suffix}`,
      intervalSeconds: 3_600,
      nextRunAt: new Date(Date.now() + 3_600_000),
    },
  });

  await page.goto(`/deployments/${deployment.id}`);

  await expect(page.getByRole("heading", { name: "Deployment detail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate deployment" })).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.getByRole("button", { name: "Deactivate deployment" }).click();

  await expect
    .poll(
      async () => {
        const [updatedDeployment, updatedTask, updatedSchedule] = await Promise.all([
          prisma.deployment.findUnique({
            where: {
              id: deployment.id,
            },
            select: {
              status: true,
            },
          }),
          prisma.task.findUnique({
            where: {
              id: task.id,
            },
            select: {
              deploymentId: true,
              executionConfig: true,
            },
          }),
          prisma.taskSchedule.findUnique({
            where: {
              id: schedule.id,
            },
            select: {
              enabled: true,
              revision: true,
              lockedAt: true,
            },
          }),
        ]);

        return {
          deploymentStatus: updatedDeployment?.status ?? null,
          taskDeploymentId: updatedTask?.deploymentId ?? null,
          taskExecutionConfig: updatedTask?.executionConfig ?? null,
          scheduleEnabled: updatedSchedule?.enabled ?? null,
          scheduleRevision: updatedSchedule?.revision ?? null,
          scheduleLockedAt: updatedSchedule?.lockedAt ?? null,
        };
      },
      {
        timeout: 10_000,
      },
    )
    .toEqual({
      deploymentStatus: "INACTIVE",
      taskDeploymentId: null,
      taskExecutionConfig: null,
      scheduleEnabled: false,
      scheduleRevision: 2,
      scheduleLockedAt: null,
    });

  await expect(page.locator("body")).toContainText("INACTIVE");
  await expect(page.locator("body")).toContainText("This deployment has no registered tasks.");
  await expect(
    page.getByRole("button", {
      name: "Deactivate deployment",
    }),
  ).not.toBeVisible();
});
