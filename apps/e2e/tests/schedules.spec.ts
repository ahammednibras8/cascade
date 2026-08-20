import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getDashboardTestEnvironment } from "./support/dashboard-environment.js";
import { createExecutionConfig } from "./support/execution-config.js";
import { selectDashboardWorkspace } from "./support/dashboard-workspace.js";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const createdTaskIds: string[] = [];

async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

test.afterEach(async () => {
  const prisma = await getPrisma();
  const taskIds = createdTaskIds.splice(0);

  if (taskIds.length > 0) {
    await prisma.task.deleteMany({
      where: {
        id: {
          in: taskIds,
        },
      },
    });
  }
});

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("dashboard lists, pauses, and resumes a schedule", async ({ page }) => {
  const prisma = await getPrisma();
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const suffix = randomUUID().slice(0, 8);
  const executionConfig = createExecutionConfig(`e2e-schedule-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-schedule-${suffix}`,
      name: "E2E Scheduled Task",
      executionConfig,
    },
  });

  createdTaskIds.push(task.id);

  const schedule = await prisma.taskSchedule.create({
    data: {
      taskId: task.id,
      name: `E2E interval schedule ${suffix}`,
      scheduleType: "INTERVAL",
      intervalSeconds: 3600,
      cronExpression: null,
      timezone: "UTC",
      nextRunAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await page.goto("/schedules");

  await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible();

  const row = page.getByRole("row").filter({
    hasText: schedule.id,
  });

  await expect(row).toBeVisible();
  await expect(row).toContainText(schedule.name);
  await expect(row).toContainText("E2E Scheduled Task");
  await expect(row).toContainText(task.slug);
  await expect(row).toContainText("Every 3600 seconds");
  await expect(row).toContainText("Enabled");

  await row.getByRole("button", { name: "Pause schedule" }).click();

  await expect
    .poll(
      async () => {
        const updated = await prisma.taskSchedule.findUnique({
          where: {
            id: schedule.id,
          },
          select: {
            enabled: true,
            revision: true,
            lockedAt: true,
          },
        });

        return updated;
      },
      {
        timeout: 10_000,
      },
    )
    .toEqual({
      enabled: false,
      revision: 2,
      lockedAt: null,
    });

  await expect(row).toContainText("Paused");
  await expect(
    row.getByRole("button", {
      name: "Resume schedule",
    }),
  ).toBeVisible();

  await row.getByRole("button", { name: "Resume schedule" }).click();

  await expect
    .poll(
      async () => {
        const updated = await prisma.taskSchedule.findUnique({
          where: {
            id: schedule.id,
          },
          select: {
            enabled: true,
            revision: true,
            lockedAt: true,
            nextRunAt: true,
          },
        });

        return {
          enabled: updated?.enabled ?? null,
          revision: updated?.revision ?? null,
          lockedAt: updated?.lockedAt ?? null,
          nextRunAtIsFuture:
            updated?.nextRunAt !== undefined && updated.nextRunAt.getTime() > Date.now(),
        };
      },
      {
        timeout: 10_000,
      },
    )
    .toEqual({
      enabled: true,
      revision: 3,
      lockedAt: null,
      nextRunAtIsFuture: true,
    });

  await expect(row).toContainText("Enabled");
  await expect(
    row.getByRole("button", {
      name: "Pause schedule",
    }),
  ).toBeVisible();
});

test("dashboard creates and edits a cron schedule", async ({ page }) => {
  const prisma = await getPrisma();
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const suffix = randomUUID().slice(0, 8);
  const executionConfig = createExecutionConfig(`e2e-schedule-form-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-schedule-form-${suffix}`,
      name: "E2E Schedule Form Task",
      executionConfig,
    },
  });

  createdTaskIds.push(task.id);

  const scheduleName = `E2E weekday schedule ${suffix}`;
  const updatedScheduleName = `E2E updated weekday schedule ${suffix}`;

  await page.goto("/schedules/new");

  await expect(page.getByRole("heading", { name: "New schedule" })).toBeVisible();

  await page.getByLabel("Task").selectOption(task.id);
  await page.getByLabel("Name").fill(scheduleName);
  await page.getByLabel("Schedule type").selectOption("CRON");
  await page.getByLabel("Cron expression").fill("0 9 * * 1-5");
  await page.getByLabel("Timezone").fill("Asia/Kolkata");
  await page.getByLabel(/Payload JSON/).fill('{"customerId":"customer-1","source":"e2e"}');

  await page.getByRole("button", { name: "Create schedule" }).click();

  await expect(page).toHaveURL(/\/schedules$/);

  const createdSchedule = await expect
    .poll(
      async () =>
        prisma.taskSchedule.findFirst({
          where: {
            taskId: task.id,
            name: scheduleName,
          },
          select: {
            id: true,
            scheduleType: true,
            intervalSeconds: true,
            cronExpression: true,
            timezone: true,
            payload: true,
            revision: true,
          },
        }),
      {
        timeout: 10_000,
      },
    )
    .not.toBeNull();

  const schedule = await prisma.taskSchedule.findFirstOrThrow({
    where: {
      taskId: task.id,
      name: scheduleName,
    },
    select: {
      id: true,
      scheduleType: true,
      intervalSeconds: true,
      cronExpression: true,
      timezone: true,
      payload: true,
      revision: true,
    },
  });

  expect(createdSchedule).not.toBeNull();
  expect(schedule).toMatchObject({
    scheduleType: "CRON",
    intervalSeconds: null,
    cronExpression: "0 9 * * 1-5",
    timezone: "Asia/Kolkata",
    payload: {
      customerId: "customer-1",
      source: "e2e",
    },
    revision: 1,
  });

  const row = page.getByRole("row").filter({
    hasText: schedule.id,
  });

  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "Edit schedule" }).click();

  await expect(page).toHaveURL(new RegExp(`/schedules/${schedule.id}/edit$`));
  await expect(page.getByRole("heading", { name: "Edit schedule" })).toBeVisible();

  await page.getByLabel("Name").fill(updatedScheduleName);
  await page.getByLabel("Cron expression").fill("30 10 * * 1-5");
  await page.getByLabel("Timezone").fill("UTC");
  await page
    .getByLabel("Replacement payload JSON")
    .fill('{"customerId":"customer-2","source":"edited-e2e"}');

  await page.getByRole("button", { name: "Save schedule" }).click();

  await expect(page).toHaveURL(/\/schedules$/);

  await expect
    .poll(
      async () =>
        prisma.taskSchedule.findUnique({
          where: {
            id: schedule.id,
          },
          select: {
            name: true,
            scheduleType: true,
            intervalSeconds: true,
            cronExpression: true,
            timezone: true,
            payload: true,
            revision: true,
          },
        }),
      {
        timeout: 10_000,
      },
    )
    .toEqual({
      name: updatedScheduleName,
      scheduleType: "CRON",
      intervalSeconds: null,
      cronExpression: "30 10 * * 1-5",
      timezone: "UTC",
      payload: {
        customerId: "customer-2",
        source: "edited-e2e",
      },
      revision: 2,
    });

  await expect(
    page.getByRole("row").filter({
      hasText: updatedScheduleName,
    }),
  ).toBeVisible();
});
