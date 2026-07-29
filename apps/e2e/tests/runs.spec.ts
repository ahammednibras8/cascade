import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getDashboardTestEnvironment } from "./support/dashboard-environment.js";
import { createExecutionConfig } from "./support/execution-config.js";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const createdTaskIds: string[] = [];

async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

test.afterEach(async () => {
  const prisma = await getPrisma();
  const taskIds = createdTaskIds.splice(0);

  if (taskIds.length === 0) {
    return;
  }

  await prisma.task.deleteMany({
    where: {
      id: {
        in: taskIds,
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
  const { environment, project } = await getDashboardTestEnvironment();
  const suffix = randomUUID().slice(0, 8);
  const executionConfig = createExecutionConfig(`e2e-hello-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-hello-${suffix}`,
      name: "E2E Hello Task",
      executionConfig,
    },
  });

  createdTaskIds.push(task.id);

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

  await page.goto("/runs");

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
});
