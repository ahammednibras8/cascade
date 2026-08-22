import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getDashboardTestEnvironment } from "./support/dashboard-environment.js";
import { createExecutionConfig } from "./support/execution-config.js";
import { selectDashboardWorkspace } from "./support/dashboard-workspace.js";

process.env["DATABASE_URL"] ??= "postgresql://cascade:cascade@localhost:15432/cascade";

async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

async function deleteTasks(taskIds: string[]) {
  if (taskIds.length === 0) {
    return;
  }

  const prisma = await getPrisma();

  await prisma.task.deleteMany({
    where: {
      id: {
        in: taskIds,
      },
    },
  });
}

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("shows task runs in the dashboard table", async ({ page }) => {
  const prisma = await getPrisma();
  const { environment, project } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const suffix = randomUUID().slice(0, 8);
  const executionConfig = createExecutionConfig(`e2e-hello-${suffix}`);
  const taskIds: string[] = [];

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-hello-${suffix}`,
      name: "E2E Hello Task",
      executionConfig,
    },
  });

  taskIds.push(task.id);

  try {
    const run = await prisma.taskRun.create({
      data: {
        taskId: task.id,
        status: "PENDING",
        executionConfig,
        payload: {
          message: "hello from e2e",
        },
      },
    });

    await page.goto("/runs", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: "Task runs" })).toBeVisible();

    const row = page.getByRole("row").filter({
      hasText: run.id,
    });

    await expect(row).toBeVisible();
    await expect(row).toContainText("PENDING");
    await expect(row).toContainText("E2E Hello Task");
    await expect(row).toContainText(task.slug);
    await expect(row).toContainText(project.name);
    await expect(row).toContainText(`${project.slug}/${environment.slug}`);
  } finally {
    await deleteTasks(taskIds);
  }
});

test("dashboard paginates task runs", async ({ page }) => {
  const prisma = await getPrisma();
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const suffix = randomUUID().slice(0, 8);
  const executionConfig = createExecutionConfig(`e2e-run-pagination-${suffix}`);
  const taskIds: string[] = [];

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-run-pagination-${suffix}`,
      name: "E2E Run Pagination Task",
      executionConfig,
    },
  });

  taskIds.push(task.id);

  const runIds = Array.from({ length: 51 }, () => randomUUID());

  try {
    await prisma.taskRun.createMany({
      data: runIds.map((id, index) => ({
        id,
        taskId: task.id,
        status: "COMPLETED",
        executionConfig,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        completedAt: new Date(Date.UTC(2026, 0, 1, 0, 1, index)),
      })),
    });

    await page.goto(`/runs?taskId=${task.id}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: "Task runs" })).toBeVisible();

    await expect(page.getByRole("link", { name: runIds[50]! })).toBeVisible();
    await expect(page.getByRole("link", { name: runIds[0]! })).not.toBeVisible();
    await expect(page.getByText("Showing 50 runs on this page · 51 total")).toBeVisible();

    await page.getByRole("link", { name: "Next page" }).click();

    await expect(page).toHaveURL(/\/runs\?.*taskId=.*cursor=/);
    await expect(page.getByRole("link", { name: runIds[0]! })).toBeVisible();
    await expect(page.getByRole("link", { name: "First page" })).toBeVisible();
    await expect(page.getByText("End of list")).toBeVisible();
  } finally {
    await deleteTasks(taskIds);
  }
});

test("updates the runs list when realtime receives an environment event", async ({ page }) => {
  const prisma = await getPrisma();
  const { createTaskRunEvent } = await import("@cascade/database");
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const suffix = randomUUID().slice(0, 8);
  const executionConfig = createExecutionConfig(`e2e-live-runs-${suffix}`);
  const taskIds: string[] = [];

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-live-runs-${suffix}`,
      name: "E2E Live Runs Task",
      executionConfig,
    },
  });

  taskIds.push(task.id);

  try {
    await page.goto("/runs", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: "Task runs" })).toBeVisible();

    const run = await prisma.taskRun.create({
      data: {
        taskId: task.id,
        status: "PENDING",
        executionConfig,
        payload: {
          source: "runs-list-sse",
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await createTaskRunEvent(tx, {
        taskRunId: run.id,
        type: "task.triggered",
        level: "INFO",
        message: "Run created for runs-list realtime test",
      });
    });

    const row = page.getByRole("row").filter({
      hasText: run.id,
    });

    await expect(row).toBeVisible({
      timeout: 15_000,
    });

    await expect(row).toContainText("PENDING");
    await expect(row).toContainText("E2E Live Runs Task");
  } finally {
    await deleteTasks(taskIds);
  }
});
