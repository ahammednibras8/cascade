import { expect, test } from "@playwright/test";
import { cleanupDashboardProjects, disconnectPrisma } from "./support/dashboard-project.js";
import {
  clickConfirmedButton,
  createDeploymentWithTask,
  createRollbackDeploymentFixture,
  expectDeploymentDeactivated,
  expectDeploymentRolledBack,
} from "./support/deployments.js";

test.afterEach(cleanupDashboardProjects);
test.afterAll(disconnectPrisma);

test("shows deployments and their worker runtime state", async ({ page }) => {
  const { deployment } = await createDeploymentWithTask({
    slugPrefix: "e2e-deployments",
    projectName: "E2E Deployments Project",
    environmentName: "E2E Deployments Dev",
    versionPrefix: "e2e-deployment",
    image: "ghcr.io/cascade/example-worker:e2e",
    runtimeStatus: "RUNNING",
    taskSlugPrefix: "e2e-deployment-task",
    taskName: "E2E Deployment Task",
    createRun: true,
  });

  await page.goto("/deployments");
  await expect(page.getByRole("heading", { name: "Deployments" })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: deployment.version });
  await expect(row).toBeVisible();
  await expect(row).toContainText(deployment.id);
  await expect(row).toContainText(deployment.image);
  await expect(row).toContainText("ACTIVE");
  await expect(row).toContainText("RUNNING");
  await expect(row.locator("td").nth(4)).toHaveText("1");
  await expect(row.locator("td").nth(5)).toHaveText("1");
});

test("opens deployment detail and shows its registered task configuration", async ({ page }) => {
  const { deployment, task } = await createDeploymentWithTask({
    slugPrefix: "e2e-deployment-detail",
    projectName: "E2E Deployment Detail Project",
    environmentName: "E2E Deployment Detail Dev",
    versionPrefix: "e2e-detail",
    image: "ghcr.io/cascade/detail-worker:e2e",
    runtimeStatus: "FAILED",
    runtimeError: "Worker image could not start",
    runtimeStartedAt: new Date("2026-08-16T10:00:00.000Z"),
    runtimeStoppedAt: new Date("2026-08-16T10:05:00.000Z"),
    taskSlugPrefix: "e2e-detail-task",
    taskName: "E2E Deployment Detail Task",
    taskDescription: "Visible in deployment detail",
    createRun: true,
    createSchedule: true,
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

  const taskRow = page.getByRole("row").filter({ hasText: task.slug });
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
  const { deployment, prisma, schedule, task } = await createDeploymentWithTask({
    slugPrefix: "e2e-deactivate-deployment",
    projectName: "E2E Deactivate Deployment Project",
    environmentName: "E2E Deactivate Deployment Dev",
    versionPrefix: "e2e-deactivate",
    image: "ghcr.io/cascade/deactivate-worker:e2e",
    runtimeStatus: "RUNNING",
    taskSlugPrefix: "e2e-deactivate-task",
    taskName: "E2E Deactivate Task",
    createSchedule: true,
  });

  if (!schedule) {
    throw new Error("Expected deactivate fixture to create a schedule");
  }

  await page.goto(`/deployments/${deployment.id}`);
  await expect(page.getByRole("heading", { name: "Deployment detail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate deployment" })).toBeVisible();

  await clickConfirmedButton(page, "Deactivate deployment");
  await expectDeploymentDeactivated({
    prisma,
    deploymentId: deployment.id,
    taskId: task.id,
    scheduleId: schedule.id,
  });

  await expect(page.locator("body")).toContainText("INACTIVE");
  await expect(page.locator("body")).toContainText("This deployment has no registered tasks.");
  await expect(page.getByRole("button", { name: "Deactivate deployment" })).not.toBeVisible();
});

test("dashboard rolls back an inactive deployment from its saved manifest", async ({ page }) => {
  const fixture = await createRollbackDeploymentFixture();

  await page.goto(`/deployments/${fixture.targetDeployment.id}`);
  await expect(page.getByRole("heading", { name: "Deployment detail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Roll back deployment" })).toBeVisible();

  const manifestSection = page.getByRole("heading", { name: "Saved task manifest" }).locator("..");
  const manifestTaskRow = manifestSection.getByRole("row").filter({
    hasText: fixture.restoredTaskSlug,
  });

  await expect(manifestTaskRow).toBeVisible();
  await expect(manifestTaskRow).toContainText("E2E Restored Task");
  await expect(manifestTaskRow).toContainText("Restored by rollback");
  await expect(manifestTaskRow).toContainText("Attempts 3");
  await expect(manifestTaskRow).toContainText("Queue");

  await clickConfirmedButton(page, "Roll back deployment");
  await expectDeploymentRolledBack({
    prisma: fixture.prisma,
    environmentId: fixture.environment.id,
    targetDeploymentId: fixture.targetDeployment.id,
    currentDeploymentId: fixture.currentDeployment.id,
    restoredTaskSlug: fixture.restoredTaskSlug,
    restoredExecutionConfig: fixture.restoredExecutionConfig,
    omittedTaskId: fixture.omittedTask.id,
    omittedScheduleId: fixture.omittedSchedule.id,
  });

  await expect(page.locator("body")).toContainText("ACTIVE");
  await expect(page.getByRole("button", { name: "Deactivate deployment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Roll back deployment" })).not.toBeVisible();

  const tasksSection = page
    .getByRole("heading", { name: "Tasks in this deployment" })
    .locator("..");
  const restoredTaskRow = tasksSection.getByRole("row").filter({
    hasText: fixture.restoredTaskSlug,
  });

  await expect(restoredTaskRow).toBeVisible();
  await expect(restoredTaskRow).toContainText("E2E Restored Task");
  await expect(restoredTaskRow).toContainText("Restored by rollback");
});
