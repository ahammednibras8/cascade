import { prisma } from "@cascade/database";
import { inspectContainer, removeContainer, runDocker } from "./docker.js";
import { deploymentRunnerConfig } from "./config.js";

type Deployment = Awaited<ReturnType<typeof getDeployments>>[number];

function getContainerName(deploymentId: string) {
  return `cascade-deployment-${deploymentId}`;
}

function getSafeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message.slice(0, 2_000);
}

function getDeploymentWorkerEnvironment(deploymentId: string) {
  const environment: Record<string, string> = {
    NODE_ENV: "production",
    CASCADE_DEPLOYMENT_ID: deploymentId,
    DATABASE_URL: deploymentRunnerConfig.deploymentDatabaseUrl,
    QUEUE_REDIS_URL: deploymentRunnerConfig.deploymentQueueRedisUrl,
    WORKER_CONCURRENCY: String(deploymentRunnerConfig.workerConcurrency),
  };

  const optionalEnvironment = {
    S3_ENDPOINT: deploymentRunnerConfig.s3Endpoint,
    S3_REGION: deploymentRunnerConfig.s3Region,
    S3_ACCESS_KEY_ID: deploymentRunnerConfig.s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: deploymentRunnerConfig.s3SecretAccessKey,
    S3_BUCKET: deploymentRunnerConfig.s3Bucket,
    S3_FORCE_PATH_STYLE: deploymentRunnerConfig.s3Bucket,
    LARGE_PAYLOAD_THRESHOLD_BYTES: deploymentRunnerConfig.largePayloadThresholdBytes,
  };

  for (const [name, value] of Object.entries(optionalEnvironment)) {
    if (value) {
      environment[name] = value;
    }
  }

  return environment;
}

async function getDeployments() {
  return prisma.deployment.findMany({
    where: {
      status: {
        in: ["ACTIVE", "INACTIVE"],
      },
    },
    select: {
      id: true,
      image: true,
      status: true,
      runtimeStatus: true,
      runtimeStartedAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

async function markDeploymentFailed(deployment: Deployment, error: unknown) {
  await prisma.deployment.update({
    where: {
      id: deployment.id,
    },
    data: {
      runtimeStatus: "FAILED",
      runtimeError: getSafeErrorMessage(error),
    },
  });
}

async function ensureDeploymentContainerRunning(
  deployment: Deployment,
  finalRuntimeStatus: "RUNNING" | "DRAINING",
) {
  const containerName = getContainerName(deployment.id);
  const existingContainer = await inspectContainer(containerName);

  if (existingContainer?.running) {
    await prisma.deployment.update({
      where: {
        id: deployment.id,
      },
      data: {
        runtimeStatus: finalRuntimeStatus,
        runtimeContainerId: existingContainer.id,
        runtimeError: null,
        runtimeStartedAt: deployment.runtimeStartedAt ?? new Date(),
        runtimeStoppedAt: null,
      },
    });

    return;
  }

  if (existingContainer) {
    await removeContainer(containerName);
  }

  await prisma.deployment.update({
    where: {
      id: deployment.id,
    },
    data: {
      runtimeStatus: "STARTING",
      runtimeError: null,
      runtimeStoppedAt: null,
    },
  });

  if (deploymentRunnerConfig.pullImages) {
    await runDocker(["pull", deployment.image]);
  }

  const environment = getDeploymentWorkerEnvironment(deployment.id);

  const dockerArgs = [
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    "cascade.managed=true",
    "--label",
    `cascade.deployment-id=${deployment.id}`,
    "--network",
    deploymentRunnerConfig.dockerNetwork,
    "--restart",
    "unless-stopped",
  ];

  for (const [name, value] of Object.entries(environment)) {
    dockerArgs.push("--env", `${name}=${value}`);
  }

  dockerArgs.push(deployment.image);

  const containerId = await runDocker(dockerArgs);

  await prisma.deployment.update({
    where: {
      id: deployment.id,
    },
    data: {
      runtimeStatus: finalRuntimeStatus,
      runtimeContainerId: containerId,
      runtimeError: null,
      runtimeStartedAt: new Date(),
      runtimeStoppedAt: null,
    },
  });
}

async function reconcileActiveDeployment(deployment: Deployment) {
  try {
    await ensureDeploymentContainerRunning(deployment, "RUNNING");
  } catch (error) {
    await markDeploymentFailed(deployment, error);
  }
}

async function reconcileInactiveDeployment(deployment: Deployment) {
  const activeRunCount = await prisma.taskRun.count({
    where: {
      deploymentId: deployment.id,
      status: {
        in: ["PENDING", "EXECUTING"],
      },
    },
  });

  if (activeRunCount > 0) {
    try {
      await ensureDeploymentContainerRunning(deployment, "DRAINING");
    } catch (error) {
      await markDeploymentFailed(deployment, error);
    }

    return;
  }

  try {
    await removeContainer(getContainerName(deployment.id));

    await prisma.deployment.update({
      where: {
        id: deployment.id,
      },
      data: {
        runtimeStatus: "STOPPED",
        runtimeContainerId: null,
        runtimeError: null,
        runtimeStoppedAt: new Date(),
      },
    });
  } catch (error) {
    await markDeploymentFailed(deployment, error);
  }
}

export async function reconcileDeployments() {
  const deployments = await getDeployments();

  for (const deployment of deployments) {
    if (deployment.status === "ACTIVE") {
      await reconcileActiveDeployment(deployment);
    } else {
      await reconcileInactiveDeployment(deployment);
    }
  }
}
