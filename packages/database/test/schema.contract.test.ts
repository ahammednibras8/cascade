import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
});

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const trackedProjectIds = new Set<string>();
const EXECUTION_CONFIG = {
  schemaVersion: 1,
  timeoutMs: 30_000,
  retry: { maxAttempts: 3, delayMs: 1_000, exponentialBackoff: true },
  queue: { name: "default", concurrencyLimit: 2 },
};

type DatabaseModule = typeof import("../src/index.js");
type PrismaClient = DatabaseModule["prisma"];

let database: DatabaseModule | undefined;

function getPrisma() {
  if (!database) throw new Error("Database module was not loaded");

  return database.prisma;
}

function first<T>(values: T[]) {
  const value = values[0];

  if (!value) throw new Error("Expected at least one value");

  return value;
}

async function expectUniqueViolation(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "P2002" });
}

async function deleteProject(prisma: PrismaClient, projectId: string) {
  await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
  trackedProjectIds.delete(projectId);
}

async function deleteTrackedProjects() {
  const prisma = database?.prisma;

  if (!prisma) return;

  await Promise.all([...trackedProjectIds].map((projectId) => deleteProject(prisma, projectId)));
}

async function createProjectGraph(prisma: PrismaClient, suffix: string) {
  const project = await prisma.project.create({
    data: {
      slug: `schema-contract-${suffix}`,
      name: "Schema Contract Project",
      environments: {
        create: {
          slug: "dev",
          name: "Development",
          apiKeys: {
            create: {
              name: "Development API key",
              keyPrefix: `csc_${suffix.slice(0, 8)}`,
              keyHash: `hash_${suffix}`,
            },
          },
          tasks: { create: { slug: "hello", name: "Hello" } },
        },
      },
    },
    include: {
      environments: {
        include: {
          apiKeys: true,
          tasks: true,
        },
      },
    },
  });

  trackedProjectIds.add(project.id);
  const environment = first(project.environments);

  return {
    project,
    environment,
    apiKey: first(environment.apiKeys),
    task: first(environment.tasks),
  };
}

async function createTaskRunGraph(prisma: PrismaClient, taskId: string) {
  const run = await prisma.taskRun.create({
    data: { taskId, payload: { message: "hello" } },
  });

  const attempt = await prisma.taskAttempt.create({
    data: { taskRunId: run.id, attemptNumber: 1 },
  });

  const event = await prisma.taskEvent.create({
    data: { taskRunId: run.id, taskAttemptId: attempt.id, type: "LOG", message: "Task started" },
  });

  return { attempt, event, run };
}

async function createDeploymentManifest(
  prisma: PrismaClient,
  environmentId: string,
  suffix: string,
) {
  return prisma.deployment.create({
    data: {
      environmentId,
      version: `schema-contract-deployment-${suffix}`,
      image: "ghcr.io/cascade/schema-contract-worker:test",
      manifestTasks: { create: manifestTaskData() },
    },
    include: { manifestTasks: true },
  });
}

function manifestTaskData() {
  return {
    slug: "hello",
    name: "Hello",
    description: "Deployment manifest task",
    executionConfig: EXECUTION_CONFIG,
  };
}

function expectManifestTask(deployment: Awaited<ReturnType<typeof createDeploymentManifest>>) {
  expect(deployment.manifestTasks).toEqual([
    expect.objectContaining({
      deploymentId: deployment.id,
      slug: "hello",
      name: "Hello",
      description: "Deployment manifest task",
      executionConfig: EXECUTION_CONFIG,
    }),
  ]);
}

async function expectGraphDeleted(
  prisma: PrismaClient,
  ids: { attemptId: string; eventId: string; runId: string },
) {
  await expect(prisma.taskRun.findUnique({ where: { id: ids.runId } })).resolves.toBeNull();
  await expect(prisma.taskAttempt.findUnique({ where: { id: ids.attemptId } })).resolves.toBeNull();
  await expect(prisma.taskEvent.findUnique({ where: { id: ids.eventId } })).resolves.toBeNull();
}

async function deleteIdentityGraph(
  prisma: PrismaClient,
  ids: { organizationId?: string; projectId?: string; userId?: string },
) {
  if (ids.projectId) {
    await deleteProject(prisma, ids.projectId);
  }

  if (ids.organizationId) {
    await prisma.organization.delete({ where: { id: ids.organizationId } }).catch(() => {});
  }

  if (ids.userId) {
    await prisma.user.delete({ where: { id: ids.userId } }).catch(() => {});
  }
}

describeWithDatabase("Postgres schema contract", () => {
  beforeAll(async () => {
    database = await import("../src/index.js");
  });

  afterAll(async () => {
    await deleteTrackedProjects();
    await database?.prisma.$disconnect();
  });

  it("stores the durable task graph and enforces core constraints", async () => {
    const prisma = getPrisma();
    const suffix = randomUUID();
    const { apiKey, environment, project, task } = await createProjectGraph(prisma, suffix);

    expect(environment.type).toBe("DEVELOPMENT");
    expect(apiKey.revokedAt).toBeNull();

    await expectUniqueViolation(
      prisma.task.create({
        data: { environmentId: environment.id, slug: task.slug, name: "Duplicate Hello" },
      }),
    );

    const { attempt, event, run } = await createTaskRunGraph(prisma, task.id);
    expect(run.status).toBe("PENDING");
    expect(attempt.status).toBe("EXECUTING");
    expect(event.level).toBe("INFO");

    const deployment = await createDeploymentManifest(prisma, environment.id, suffix);
    expectManifestTask(deployment);

    await expectUniqueViolation(
      prisma.deploymentTask.create({
        data: {
          deploymentId: deployment.id,
          slug: "hello",
          name: "Duplicate manifest task",
          executionConfig: { schemaVersion: 1 },
        },
      }),
    );

    await deleteProject(prisma, project.id);
    await expectGraphDeleted(prisma, { attemptId: attempt.id, eventId: event.id, runId: run.id });
  });

  it("stores OIDC identities and organization memberships", async () => {
    const prisma = getPrisma();
    const suffix = randomUUID();
    const cleanupIds: { organizationId?: string; projectId?: string; userId?: string } = {};

    try {
      const user = await prisma.user.create({
        data: {
          email: `schema-user-${suffix}@example.test`,
          displayName: "Schema Contract Owner",
          identities: { create: { provider: "oidc", subject: `subject-${suffix}` } },
        },
        include: { identities: true },
      });
      cleanupIds.userId = user.id;

      const organization = await prisma.organization.create({
        data: {
          slug: `schema-org-${suffix}`,
          name: "Schema Contract Organization",
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      cleanupIds.organizationId = organization.id;

      const organizationProject = await prisma.project.create({
        data: {
          organizationId: organization.id,
          slug: `schema-org-project-${suffix}`,
          name: "Schema Organization Project",
        },
      });
      cleanupIds.projectId = organizationProject.id;
      trackedProjectIds.add(organizationProject.id);

      expect(user.identities).toEqual([
        expect.objectContaining({
          userId: user.id,
          provider: "oidc",
          subject: `subject-${suffix}`,
        }),
      ]);

      await expect(
        prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId: organization.id, userId: user.id },
          },
          select: { role: true },
        }),
      ).resolves.toEqual({ role: "OWNER" });

      expect(organizationProject.organizationId).toBe(organization.id);
    } finally {
      await deleteIdentityGraph(prisma, cleanupIds);
    }
  });
});
