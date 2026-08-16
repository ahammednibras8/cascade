import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
});

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

let database: typeof import("../src/index.js") | undefined;
let projectId: string | undefined;

function getPrisma() {
  if (!database) {
    throw new Error("Database module was not loaded");
  }

  return database.prisma;
}

function first<T>(values: T[]) {
  const value = values[0];

  if (!value) {
    throw new Error("Expected at least one value");
  }

  return value;
}

describeWithDatabase("Postgres schema contract", () => {
  beforeAll(async () => {
    database = await import("../src/index.js");
  });

  afterAll(async () => {
    const prisma = database?.prisma;

    if (!prisma) {
      return;
    }

    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    }

    await prisma.$disconnect();
  });

  it("stores the durable task graph and enforces core constaints", async () => {
    const prisma = getPrisma();
    const suffix = randomUUID();

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
            tasks: {
              create: {
                slug: "hello",
                name: "Hello",
              },
            },
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

    projectId = project.id;

    const environment = first(project.environments);
    const apiKey = first(environment.apiKeys);
    const task = first(environment.tasks);

    expect(environment.type).toBe("DEVELOPMENT");
    expect(apiKey.revokedAt).toBeNull();

    await expect(
      prisma.task.create({
        data: {
          environmentId: environment.id,
          slug: task.slug,
          name: "Duplicate Hello",
        },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    });

    const run = await prisma.taskRun.create({
      data: {
        taskId: task.id,
        payload: {
          message: "hello",
        },
      },
    });

    expect(run.status).toBe("PENDING");

    const attempt = await prisma.taskAttempt.create({
      data: {
        taskRunId: run.id,
        attemptNumber: 1,
      },
    });

    expect(attempt.status).toBe("EXECUTING");

    const event = await prisma.taskEvent.create({
      data: {
        taskRunId: run.id,
        taskAttemptId: attempt.id,
        type: "LOG",
        message: "Task started",
      },
    });

    expect(event.level).toBe("INFO");

    const deployment = await prisma.deployment.create({
      data: {
        environmentId: environment.id,
        version: `schema-contract-deployment-${suffix}`,
        image: "ghcr.io/cascade/schema-contract-worker:test",
        manifestTasks: {
          create: {
            slug: "hello",
            name: "Hello",
            description: "Deployment manifest task",
            executionConfig: {
              schemaVersion: 1,
              timeoutMs: 30_000,
              retry: {
                maxAttempts: 3,
                delayMs: 1_000,
                exponentialBackoff: true,
              },
              queue: {
                name: "default",
                concurrencyLimit: 2,
              },
            },
          },
        },
      },
      include: {
        manifestTasks: true,
      },
    });

    expect(deployment.manifestTasks).toEqual([
      expect.objectContaining({
        deploymentId: deployment.id,
        slug: "hello",
        name: "Hello",
        description: "Deployment manifest task",
        executionConfig: {
          schemaVersion: 1,
          timeoutMs: 30_000,
          retry: {
            maxAttempts: 3,
            delayMs: 1_000,
            exponentialBackoff: true,
          },
          queue: {
            name: "default",
            concurrencyLimit: 2,
          },
        },
      }),
    ]);

    await expect(
      prisma.deploymentTask.create({
        data: {
          deploymentId: deployment.id,
          slug: "hello",
          name: "Duplicate manifest task",
          executionConfig: {
            schemaVersion: 1,
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    });

    await prisma.project.delete({
      where: {
        id: project.id,
      },
    });

    projectId = undefined;

    await expect(
      prisma.taskRun.findUnique({
        where: {
          id: run.id,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      prisma.taskAttempt.findUnique({
        where: {
          id: attempt.id,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      prisma.taskEvent.findUnique({
        where: {
          id: event.id,
        },
      }),
    ).resolves.toBeNull();
  });
});
