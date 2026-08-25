import { expect, type Page } from "@playwright/test";
import { createDashboardProject } from "./dashboard-project.js";
import { createExecutionConfig } from "./execution-config.js";

type DashboardProject = Awaited<ReturnType<typeof createDashboardProject>>;
type Prisma = DashboardProject["prisma"];

type DeploymentFixtureInput = {
  slugPrefix: string;
  projectName: string;
  environmentName: string;
  versionPrefix: string;
  image: string;
  status?: "ACTIVE" | "INACTIVE";
  runtimeStatus?: "PENDING" | "RUNNING" | "FAILED" | "STOPPED";
  runtimeError?: string;
  runtimeStartedAt?: Date;
  runtimeStoppedAt?: Date;
  taskName: string;
  taskSlugPrefix: string;
  taskDescription?: string;
  createRun?: boolean;
  createSchedule?: boolean;
};

function futureDate() {
  return new Date(Date.now() + 3_600_000);
}

export async function createDeploymentWithTask(input: DeploymentFixtureInput) {
  const project = await createDashboardProject({
    slugPrefix: input.slugPrefix,
    projectName: input.projectName,
    environmentName: input.environmentName,
  });
  const { environment, prisma, suffix } = project;

  const deployment = await prisma.deployment.create({
    data: {
      environmentId: environment.id,
      version: `${input.versionPrefix}-${suffix}`,
      image: input.image,
      status: input.status ?? "ACTIVE",
      runtimeStatus: input.runtimeStatus ?? "RUNNING",
      runtimeError: input.runtimeError ?? null,
      runtimeStartedAt: input.runtimeStartedAt ?? null,
      runtimeStoppedAt: input.runtimeStoppedAt ?? null,
    },
  });

  const taskSlug = `${input.taskSlugPrefix}-${suffix}`;
  const executionConfig = createExecutionConfig(taskSlug);
  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      deploymentId: deployment.id,
      slug: taskSlug,
      name: input.taskName,
      description: input.taskDescription ?? null,
      executionConfig,
    },
  });

  if (input.createRun) {
    await prisma.taskRun.create({
      data: {
        taskId: task.id,
        environmentId: environment.id,
        deploymentId: deployment.id,
        status: "COMPLETED",
        executionConfig,
        completedAt: new Date(),
      },
    });
  }

  const schedule = input.createSchedule
    ? await prisma.taskSchedule.create({
        data: {
          taskId: task.id,
          environmentId: environment.id,
          name: `E2E schedule ${suffix}`,
          intervalSeconds: 3_600,
          nextRunAt: futureDate(),
        },
      })
    : null;

  return {
    ...project,
    deployment,
    executionConfig,
    task,
    schedule,
  };
}

export async function createRollbackDeploymentFixture() {
  const project = await createDashboardProject({
    slugPrefix: "e2e-rollback-deployment",
    projectName: "E2E Rollback Deployment Project",
    environmentName: "E2E Rollback Deployment Dev",
  });
  const { environment, prisma, suffix } = project;

  const restoredTaskSlug = `e2e-restored-task-${suffix}`;
  const omittedTaskSlug = `e2e-omitted-task-${suffix}`;
  const restoredExecutionConfig = createExecutionConfig(restoredTaskSlug);
  const omittedExecutionConfig = createExecutionConfig(omittedTaskSlug);

  const targetDeployment = await prisma.deployment.create({
    data: {
      environmentId: environment.id,
      version: `e2e-rollback-target-${suffix}`,
      image: "ghcr.io/cascade/rollback-target:e2e",
      status: "INACTIVE",
      runtimeStatus: "STOPPED",
      manifestTasks: {
        create: {
          slug: restoredTaskSlug,
          name: "E2E Restored Task",
          description: "Restored by rollback",
          executionConfig: restoredExecutionConfig,
        },
      },
    },
  });

  const currentDeployment = await prisma.deployment.create({
    data: {
      environmentId: environment.id,
      version: `e2e-rollback-current-${suffix}`,
      image: "ghcr.io/cascade/rollback-current:e2e",
      status: "ACTIVE",
      runtimeStatus: "RUNNING",
    },
  });

  const omittedTask = await prisma.task.create({
    data: {
      environmentId: environment.id,
      deploymentId: currentDeployment.id,
      slug: omittedTaskSlug,
      name: "E2E Omitted Task",
      executionConfig: omittedExecutionConfig,
    },
  });

  const omittedSchedule = await prisma.taskSchedule.create({
    data: {
      taskId: omittedTask.id,
      environmentId: environment.id,
      name: `E2E rollback schedule ${suffix}`,
      intervalSeconds: 3_600,
      nextRunAt: futureDate(),
    },
  });

  return {
    ...project,
    targetDeployment,
    currentDeployment,
    restoredTaskSlug,
    restoredExecutionConfig,
    omittedTask,
    omittedSchedule,
  };
}

export async function clickConfirmedButton(page: Page, name: string) {
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.getByRole("button", { name }).click();
}

export async function expectDeploymentDeactivated(input: {
  prisma: Prisma;
  deploymentId: string;
  taskId: string;
  scheduleId: string;
}) {
  await expect
    .poll(() => readDeactivationState(input), { timeout: 10_000 })
    .toEqual({
      deploymentStatus: "INACTIVE",
      taskDeploymentId: null,
      taskExecutionConfig: null,
      scheduleEnabled: false,
      scheduleRevision: 2,
      scheduleLockedAt: null,
    });
}

async function readDeactivationState(input: {
  prisma: Prisma;
  deploymentId: string;
  taskId: string;
  scheduleId: string;
}) {
  const [deployment, task, schedule] = await Promise.all([
    input.prisma.deployment.findUnique({
      where: { id: input.deploymentId },
      select: { status: true },
    }),
    input.prisma.task.findUnique({
      where: { id: input.taskId },
      select: { deploymentId: true, executionConfig: true },
    }),
    input.prisma.taskSchedule.findUnique({
      where: { id: input.scheduleId },
      select: { enabled: true, revision: true, lockedAt: true },
    }),
  ]);

  return {
    deploymentStatus: valueOrNull(deployment?.status),
    taskDeploymentId: valueOrNull(task?.deploymentId),
    taskExecutionConfig: valueOrNull(task?.executionConfig),
    scheduleEnabled: valueOrNull(schedule?.enabled),
    scheduleRevision: valueOrNull(schedule?.revision),
    scheduleLockedAt: valueOrNull(schedule?.lockedAt),
  };
}

export async function expectDeploymentRolledBack(input: {
  prisma: Prisma;
  environmentId: string;
  targetDeploymentId: string;
  currentDeploymentId: string;
  restoredTaskSlug: string;
  restoredExecutionConfig: unknown;
  omittedTaskId: string;
  omittedScheduleId: string;
}) {
  await expect
    .poll(() => readRollbackState(input), { timeout: 10_000 })
    .toEqual({
      targetStatus: "ACTIVE",
      currentStatus: "INACTIVE",
      restoredTaskDeploymentId: input.targetDeploymentId,
      restoredTaskExecutionConfig: input.restoredExecutionConfig,
      omittedTaskDeploymentId: null,
      omittedTaskExecutionConfig: null,
      omittedScheduleEnabled: false,
      omittedScheduleRevision: 2,
      omittedScheduleLockedAt: null,
    });
}

async function readRollbackState(input: Parameters<typeof expectDeploymentRolledBack>[0]) {
  const [target, current, restoredTask, omittedTask, omittedSchedule] = await Promise.all([
    input.prisma.deployment.findUnique({
      where: { id: input.targetDeploymentId },
      select: { status: true },
    }),
    input.prisma.deployment.findUnique({
      where: { id: input.currentDeploymentId },
      select: { status: true },
    }),
    input.prisma.task.findUnique({
      where: {
        environmentId_slug: {
          environmentId: input.environmentId,
          slug: input.restoredTaskSlug,
        },
      },
      select: { deploymentId: true, executionConfig: true },
    }),
    input.prisma.task.findUnique({
      where: { id: input.omittedTaskId },
      select: { deploymentId: true, executionConfig: true },
    }),
    input.prisma.taskSchedule.findUnique({
      where: { id: input.omittedScheduleId },
      select: { enabled: true, revision: true, lockedAt: true },
    }),
  ]);

  return {
    targetStatus: valueOrNull(target?.status),
    currentStatus: valueOrNull(current?.status),
    restoredTaskDeploymentId: valueOrNull(restoredTask?.deploymentId),
    restoredTaskExecutionConfig: valueOrNull(restoredTask?.executionConfig),
    omittedTaskDeploymentId: valueOrNull(omittedTask?.deploymentId),
    omittedTaskExecutionConfig: valueOrNull(omittedTask?.executionConfig),
    omittedScheduleEnabled: valueOrNull(omittedSchedule?.enabled),
    omittedScheduleRevision: valueOrNull(omittedSchedule?.revision),
    omittedScheduleLockedAt: valueOrNull(omittedSchedule?.lockedAt),
  };
}

function valueOrNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}
