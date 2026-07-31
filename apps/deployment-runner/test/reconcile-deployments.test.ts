import { beforeEach, describe, expect, it, vi } from "vitest";

type DeploymentRecord = {
  id: string;
  image: string;
  status: "ACTIVE" | "INACTIVE";
  runtimeStatus: "STOPPED" | "STARTING" | "RUNNING" | "DRAINING" | "FAILED";
  runtimeStartedAt: Date | null;
};

const deploymentRunnerConfig = vi.hoisted(() => ({
  reconcileIntervalMs: 5_000,
  dockerNetwork: "cascade_default",
  deploymentDatabaseUrl: "postgresql://cascade:cascade@postgres:5432/cascade",
  deploymentQueueRedisUrl: "redis://redis:6379",
  workerConcurrency: 2,
  pullImages: false,
  s3Endpoint: "http://rustfs:9000",
  s3Region: "us-east-1",
  s3AccessKeyId: "rustfs",
  s3SecretAccessKey: "rustfs-secret",
  s3Bucket: "cascade-payloads",
  s3ForcePathStyle: "true",
  largePayloadThresholdBytes: "1048576",
}));

const prisma = vi.hoisted(() => ({
  deployment: {
    findMany: vi.fn<() => Promise<DeploymentRecord[]>>(),
    update: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
  taskRun: {
    count: vi.fn<(args: unknown) => Promise<number>>(),
  },
}));

const inspectContainer = vi.hoisted(() =>
  vi.fn<(name: string) => Promise<{ id: string; running: boolean; restarting: boolean } | null>>(),
);
const removeContainer = vi.hoisted(() => vi.fn<(name: string) => Promise<void>>());
const runDocker = vi.hoisted(() => vi.fn<(args: string[]) => Promise<string>>());

vi.mock("@cascade/database", () => ({
  prisma,
}));

vi.mock("../src/config.js", () => ({
  deploymentRunnerConfig,
}));

vi.mock("../src/docker.js", () => ({
  inspectContainer,
  removeContainer,
  runDocker,
}));

const { reconcileDeployments } = await import("../src/reconcile-deployments.js");

function createDeployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    id: "deployment-1",
    image: "cascade-hello-deployment:local",
    status: "ACTIVE",
    runtimeStatus: "STOPPED",
    runtimeStartedAt: null,
    ...overrides,
  };
}

function getDockerRunArgs() {
  const call = runDocker.mock.calls.find(([args]) => args[0] === "run");

  if (!call) {
    throw new Error("docker run was not called");
  }

  return call[0];
}

describe("reconcileDeployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.deployment.update.mockResolvedValue({});
    prisma.taskRun.count.mockResolvedValue(0);
    inspectContainer.mockResolvedValue(null);
    removeContainer.mockResolvedValue(undefined);
    runDocker.mockResolvedValue("container-new");
  });

  it("starts an active deployment container with deployment-specific worker env", async () => {
    prisma.deployment.findMany.mockResolvedValue([createDeployment()]);

    await reconcileDeployments();

    expect(prisma.deployment.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: "deployment-1",
      },
      data: {
        runtimeStatus: "STARTING",
        runtimeError: null,
        runtimeStoppedAt: null,
      },
    });

    const dockerArgs = getDockerRunArgs();

    expect(dockerArgs).toEqual(
      expect.arrayContaining([
        "--name",
        "cascade-deployment-deployment-1",
        "--network",
        "cascade_default",
        "--restart",
        "unless-stopped",
        "cascade-hello-deployment:local",
      ]),
    );
    expect(dockerArgs).toEqual(
      expect.arrayContaining([
        "--env",
        "CASCADE_DEPLOYMENT_ID=deployment-1",
        "--env",
        "DATABASE_URL=postgresql://cascade:cascade@postgres:5432/cascade",
        "--env",
        "QUEUE_REDIS_URL=redis://redis:6379",
        "--env",
        "WORKER_CONCURRENCY=2",
        "--env",
        "S3_FORCE_PATH_STYLE=true",
      ]),
    );
    expect(dockerArgs).not.toContain("S3_FORCE_PATH_STYLE=cascade-payloads");

    expect(prisma.deployment.update).toHaveBeenLastCalledWith({
      where: {
        id: "deployment-1",
      },
      data: expect.objectContaining({
        runtimeStatus: "RUNNING",
        runtimeContainerId: "container-new",
        runtimeError: null,
        runtimeStoppedAt: null,
      }),
    });
  });

  it("replaces a restarting active deployment container", async () => {
    prisma.deployment.findMany.mockResolvedValue([createDeployment()]);
    inspectContainer.mockResolvedValue({
      id: "container-old",
      running: true,
      restarting: true,
    });

    await reconcileDeployments();

    expect(removeContainer).toHaveBeenCalledWith("cascade-deployment-deployment-1");
    expect(getDockerRunArgs()).toContain("cascade-hello-deployment:local");
    expect(prisma.deployment.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runtimeStatus: "RUNNING",
          runtimeContainerId: "container-new",
        }),
      }),
    );
  });

  it("stops an inactive deployment when no runs are pending or executing", async () => {
    prisma.deployment.findMany.mockResolvedValue([
      createDeployment({
        status: "INACTIVE",
        runtimeStatus: "DRAINING",
      }),
    ]);
    prisma.taskRun.count.mockResolvedValue(0);

    await reconcileDeployments();

    expect(removeContainer).toHaveBeenCalledWith("cascade-deployment-deployment-1");
    expect(prisma.deployment.update).toHaveBeenLastCalledWith({
      where: {
        id: "deployment-1",
      },
      data: expect.objectContaining({
        runtimeStatus: "STOPPED",
        runtimeContainerId: null,
        runtimeError: null,
      }),
    });
  });
});
