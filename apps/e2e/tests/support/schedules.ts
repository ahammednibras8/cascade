import type { Page } from "@playwright/test";
import { createExecutionConfig } from "./execution-config.js";
import { getPrisma } from "./dashboard-project.js";
import { getDashboardTestEnvironment } from "./dashboard-environment.js";
import { selectDashboardWorkspace } from "./dashboard-workspace.js";

const createdTaskIds: string[] = [];

type ScheduleTaskFixtureInput = {
  page: Page;
  suffix: string;
  slugPrefix: string;
  taskName: string;
};

export async function createScheduleTaskFixture({
  page,
  suffix,
  slugPrefix,
  taskName,
}: ScheduleTaskFixtureInput) {
  const prisma = await getPrisma();
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const taskSlug = `${slugPrefix}-${suffix}`;
  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: taskSlug,
      name: taskName,
      executionConfig: createExecutionConfig(taskSlug),
    },
  });

  createdTaskIds.push(task.id);

  return {
    prisma,
    environment,
    task,
  };
}

export async function cleanupScheduleTaskFixtures() {
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
}

export async function disconnectSchedulePrisma() {
  const prisma = await getPrisma();
  await prisma.$disconnect();
}
