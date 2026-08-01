function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value || undefined;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer greater than or equal to 1`);
  }

  return value;
}

function getBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  return value === "true";
}

type DeploymentRuntimeKind = "docker" | "kubernetes";

function getDeploymentRuntime(): DeploymentRuntimeKind {
  const runtime = process.env.DEPLOYMENT_RUNTIME ?? "docker";

  if (runtime === "docker" || runtime === "kubernetes") {
    return runtime;
  }

  throw new Error("DEPLOYMENT_RUNTIME must be docker or kubernetes");
}

const runtime = getDeploymentRuntime();

export const deploymentRunnerConfig = {
  runtime,

  reconcileIntervalMs: getPositiveIntegerEnv("DEPLOYMENT_RUNNER_POLL_MS", 5_000),

  dockerNetwork: runtime === "docker" ? getRequiredEnv("DEPLOYMENT_DOCKER_NETWORK") : undefined,

  kubernetesNamespace: getOptionalEnv("DEPLOYMENT_KUBERNETES_NAMESPACE") ?? "default",

  kubernetesRuntimeSecretName:
    runtime === "kubernetes"
      ? getRequiredEnv("DEPLOYMENT_KUBERNETES_RUNTIME_SECRET_NAME")
      : undefined,

  deploymentDatabaseUrl: getRequiredEnv("DEPLOYMENT_DATABASE_URL"),
  deploymentQueueRedisUrl: getRequiredEnv("DEPLOYMENT_QUEUE_REDIS_URL"),

  workerConcurrency: getPositiveIntegerEnv("DEPLOYMENT_WORKER_CONCURRENCY", 2),

  pullImages: getBooleanEnv("DEPLOYMENT_PULL_IMAGES", false),

  s3Endpoint: getOptionalEnv("S3_ENDPOINT"),
  s3Region: getOptionalEnv("S3_REGION"),
  s3AccessKeyId: getOptionalEnv("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: getOptionalEnv("S3_SECRET_ACCESS_KEY"),
  s3Bucket: getOptionalEnv("S3_BUCKET"),
  s3ForcePathStyle: getOptionalEnv("S3_FORCE_PATH_STYLE"),
  largePayloadThresholdBytes: getOptionalEnv("LARGE_PAYLOAD_THRESHOLD_BYTES"),
};
