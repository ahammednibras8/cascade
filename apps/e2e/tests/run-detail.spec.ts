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

  await restoreDashboardApiKey();
});

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("shows run payload, output, error, attempts, and logs", async ({ page }) => {
  const prisma = await getPrisma();
  const suffix = randomUUID().slice(0, 8);

  const project = await prisma.project.create({
    data: {
      slug: `e2e-detail-project-${suffix}`,
      name: "E2E Detail Project",
      environments: {
        create: {
          slug: `e2e-detail-dev-${suffix}`,
          name: "E2E Detail Dev",
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

  const executionConfig = createExecutionConfig(`e2e-detail-task-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-detail-task-${suffix}`,
      name: "E2E Detail Task",
      executionConfig,
    },
  });

  const run = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      status: "FAILED",
      executionConfig,
      payload: {
        message: "hello from detail e2e",
      },
      output: {
        partial: true,
      },
      error: {
        code: "TASK_FAILED",
        message: "Task failed from e2e",
      },
      traceId: "11111111111111111111111111111111",
      triggerSpanId: "2222222222222222",
      startedAt: new Date("2026-01-01T00:00:05.000Z"),
      lastHeartbeatAt: new Date("2026-01-01T00:00:10.000Z"),
      completedAt: new Date("2026-01-01T00:00:15.000Z"),
    },
  });

  const attempt = await prisma.taskAttempt.create({
    data: {
      taskRunId: run.id,
      attemptNumber: 1,
      status: "FAILED",
      error: {
        message: "Attempt failed",
      },
      startedAt: new Date("2026-01-01T00:00:05.000Z"),
      completedAt: new Date("2026-01-01T00:00:15.000Z"),
    },
  });

  await prisma.taskEvent.create({
    data: {
      taskRunId: run.id,
      taskAttemptId: attempt.id,
      type: "task.log",
      level: "ERROR",
      message: "Task failed once",
      data: {
        retryable: true,
      },
      traceId: "11111111111111111111111111111111",
      spanId: "3333333333333333",
      parentSpanId: "2222222222222222",
    },
  });

  await page.goto("/runs", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("link", { name: run.id }).click();

  await expect(page).toHaveURL(new RegExp(`/runs/${run.id}$`));
  await expect(page.getByRole("heading", { name: "Run detail" })).toBeVisible();

  await expect(page.locator("body")).toContainText(run.id);
  await expect(page.locator("body")).toContainText("FAILED");

  await expect(page.locator("body")).toContainText("E2E Detail Task");
  await expect(page.locator("body")).toContainText(task.slug);
  await expect(page.locator("body")).toContainText("E2E Detail Project");
  await expect(page.locator("body")).toContainText(`${project.slug}/${environment.slug}`);

  await expect(page.getByRole("heading", { name: "Payload" })).toBeVisible();
  await expect(page.locator("body")).toContainText("hello from detail e2e");

  await expect(page.getByRole("heading", { name: "Output" })).toBeVisible();
  await expect(page.locator("body")).toContainText("partial");

  await expect(page.getByRole("heading", { name: "Error" })).toBeVisible();
  await expect(page.locator("body")).toContainText("TASK_FAILED");
  await expect(page.locator("body")).toContainText("Task failed from e2e");

  await expect(page.getByRole("heading", { name: "Attempts" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Attempt failed");

  await expect(page.getByRole("heading", { name: "Logs / Events" })).toBeVisible();
  await expect(page.locator("body")).toContainText("task.log");
  await expect(page.locator("body")).toContainText("Task failed once");
  await expect(page.locator("body")).toContainText("retryable");
});

test("updates run detail when SSE detects run changes", async ({ page }) => {
  const prisma = await getPrisma();
  const { createTaskRunEvent } = await import("@cascade/database");
  const suffix = randomUUID().slice(0, 8);

  const project = await prisma.project.create({
    data: {
      slug: `e2e-sse-project-${suffix}`,
      name: "E2E SSE Project",
      environments: {
        create: {
          slug: `e2e-sse-dev-${suffix}`,
          name: "E2E SSE Dev",
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

  const executionConfig = createExecutionConfig(`e2e-sse-task-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-sse-task-${suffix}`,
      name: "E2E SSE Task",
      executionConfig,
    },
  });

  const run = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      status: "PENDING",
      executionConfig,
      payload: {
        message: "waiting for realtime update",
      },
    },
  });

  await page.goto(`/runs/${run.id}`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("heading", { name: "Run detail" })).toBeVisible();
  await expect(page.locator("body")).toContainText("PENDING");
  await expect(page.locator("body")).toContainText("waiting for realtime update");

  await prisma.$transaction(async (tx) => {
    await tx.taskRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "COMPLETED",
        output: {
          ok: true,
          source: "sse",
        },
        completedAt: new Date(),
      },
    });

    await createTaskRunEvent(tx, {
      taskRunId: run.id,
      type: "task.log",
      level: "INFO",
      message: "Realtime update arrived",
      data: {
        source: "sse",
      },
    });
  });

  await expect
    .poll(
      async () => {
        const entries = await prisma.$queryRaw<
          Array<{
            publishedAt: Date | null;
            publishAttempts: number;
          }>
        >`
          SELECT outbox."publishedAt", outbox."publishAttempts"
          FROM "RunEventOutbox" outbox
          INNER JOIN "TaskEvent" event ON event.id = outbox."taskEventId"
          WHERE event."taskRunId" = ${run.id}::uuid
            AND event.message = 'Realtime update arrived'
          LIMIT 1
        `;

        return entries[0] ?? null;
      },
      {
        timeout: 10_000,
      },
    )
    .toMatchObject({
      publishedAt: expect.any(Date),
      publishAttempts: 1,
    });

  await expect(page.locator("body")).toContainText("COMPLETED", {
    timeout: 15_000,
  });

  await expect(page.locator("body")).toContainText("Realtime update arrived", {
    timeout: 15_000,
  });

  await expect(page.locator("body")).toContainText("source");
  await expect(page.locator("body")).toContainText("sse");
});
