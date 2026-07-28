import { expect, test } from "@playwright/test";
import { createCascadeClient, defineTask } from "@cascade/sdk";
import { randomUUID } from "node:crypto";
import {
  ensureDashboardApiKey,
  getDashboardApiKey,
  restoreDashboardApiKey,
} from "./support/dashboard-environment.js";

const databaseURL =
  process.env.DATABASE_URL ?? "postgresql://cascade:cascade@localhost:15432/cascade";
const apiURL = process.env.CASCADE_API_URL ?? "http://localhost:3001";

process.env.DATABASE_URL = databaseURL;

const createdProjectIds: string[] = [];

let database: typeof import("@cascade/database") | undefined;

async function getPrisma() {
  database ??= await import("@cascade/database");
  return database.prisma;
}

async function createHelloTaskWithApiKey() {
  const prisma = await getPrisma();
  const suffix = randomUUID().slice(0, 8);

  const project = await prisma.project.create({
    data: {
      slug: `e2e-durable-project-${suffix}`,
      name: "E2E Durable Project",
      environments: {
        create: {
          slug: `e2e-durable-dev-${suffix}`,
          name: "E2E Durable Dev",
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
    throw new Error("Expected created environment");
  }

  await ensureDashboardApiKey(environment.id);

  // Important: worker registry currently has only task id/slug "hello".
  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: "hello",
      name: "Hello",
    },
  });

  return {
    prisma,
    project,
    environment,
    task,
    apiKey: getDashboardApiKey(),
  };
}

test.afterEach(async () => {
  const prisma = await getPrisma();
  const ids = createdProjectIds.splice(0);

  if (ids.length === 0) {
    return;
  }

  await prisma.project.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  await restoreDashboardApiKey();
});

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("triggers, executes, persists, and displays a durable task run", async ({ page }) => {
  const { prisma, task, apiKey } = await createHelloTaskWithApiKey();

  const helloTask = defineTask<{ message: string }>({
    id: "hello",
    run() {
      return {
        ok: true,
      };
    },
  });

  const cascade = createCascadeClient({
    baseUrl: apiURL,
    apiKey,
  });

  const taskRun = await cascade.triggerTask(helloTask, {
    payload: {
      message: "hello from true durable e2e",
    },
    idempotencyKey: `e2e-${randomUUID()}`,
  });

  expect(taskRun.taskId).toBe(task.id);
  expect(taskRun.status).toBe("PENDING");

  const runId = taskRun.id;

  await expect
    .poll(
      async () => {
        const run = await prisma.taskRun.findUnique({
          where: {
            id: runId,
          },
          select: {
            status: true,
          },
        });

        return run?.status ?? null;
      },
      {
        timeout: 20_000,
        intervals: [250, 500, 1_000],
      },
    )
    .toBe("COMPLETED");

  const persistedRun = await prisma.taskRun.findUniqueOrThrow({
    where: {
      id: runId,
    },
    select: {
      status: true,
      output: true,
      attempts: {
        select: {
          attemptNumber: true,
          status: true,
        },
        orderBy: {
          attemptNumber: "asc",
        },
      },
      events: {
        select: {
          type: true,
          level: true,
          message: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  expect(persistedRun.status).toBe("COMPLETED");
  expect(JSON.stringify(persistedRun.output)).toContain("Hello from local task registry");

  expect(persistedRun.attempts).toHaveLength(1);
  expect(persistedRun.attempts[0]).toMatchObject({
    attemptNumber: 1,
    status: "COMPLETED",
  });

  expect(persistedRun.events.map((event) => event.type)).toEqual(
    expect.arrayContaining([
      "task.triggered",
      "task.run.started",
      "task.log",
      "task.run.completed",
    ]),
  );

  expect(persistedRun.events.some((event) => event.message === "Hello task started")).toBe(true);

  await page.goto(`/runs/${runId}`);

  await expect(page.getByRole("heading", { name: "Run detail" })).toBeVisible();
  await expect(page.locator("body")).toContainText("COMPLETED");
  await expect(page.locator("body")).toContainText("Hello");
  await expect(page.locator("body")).toContainText("hello");
  await expect(page.locator("body")).toContainText("Hello from local task registry");
  await expect(page.locator("body")).toContainText("task.run.completed");
  await expect(page.locator("body")).toContainText("Hello task started");
});

test("dashboard cancels a pending task run", async ({ page }) => {
  const { prisma, task } = await createHelloTaskWithApiKey();

  const pendingRun = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      status: "PENDING",
    },
  });

  await page.goto(`/runs/${pendingRun.id}`);

  const cancelButton = page.getByRole("button", {
    name: "Cancel run",
  });

  await expect(cancelButton).toBeVisible();

  await cancelButton.click();

  await expect
    .poll(
      async () => {
        const run = await prisma.taskRun.findUnique({
          where: {
            id: pendingRun.id,
          },
          select: {
            status: true,
          },
        });

        return run?.status ?? null;
      },
      {
        timeout: 10_000,
      },
    )
    .toBe("CANCELED");

  await expect(page.locator("body")).toContainText("CANCELED");
});

test("dashboard replays a completed task run", async ({ page }) => {
  const { prisma, task } = await createHelloTaskWithApiKey();

  const sourceRun = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  await page.goto(`/runs/${sourceRun.id}`);

  const replayButton = page.getByRole("button", {
    name: "Replay run",
  });

  await expect(replayButton).toBeVisible();

  await replayButton.click();

  await expect
    .poll(
      async () =>
        prisma.taskRun.count({
          where: {
            taskId: task.id,
          },
        }),
      {
        timeout: 10_000,
      },
    )
    .toBe(2);

  const replayedRun = await prisma.taskRun.findFirst({
    where: {
      taskId: task.id,
      id: {
        not: sourceRun.id,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      status: true,
    },
  });

  expect(replayedRun).not.toBeNull();

  await expect
    .poll(
      async () => {
        const run = await prisma.taskRun.findUnique({
          where: {
            id: replayedRun!.id,
          },
          select: {
            status: true,
          },
        });

        return run?.status ?? null;
      },
      {
        timeout: 20_000,
      },
    )
    .toBe("COMPLETED");
});
