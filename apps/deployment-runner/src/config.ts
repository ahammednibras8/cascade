function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
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

export const deploymentRunnerConfig = {
  reconcileIntervalMs: getPositiveIntegerEnv("DEPLOYMENT_RUNNER_POLL_MS", 5_000),

  dockerNetwork: getRequiredEnv("DEPLOYMENT_DOCKER_NETWORK"),

  deploymentDatabaseUrl: getRequiredEnv("DEPLOYMENT_DATABASE_URL"),
  deploymentQueueRedisUrl: getRequiredEnv("DEPLOYMENT_QUEUE_REDIS_URL"),

  workerConcurrency: getPositiveIntegerEnv("DEPLOYMENT_WORKER_CONCURRENCY", 2),

  pullImages: getBooleanEnv("DEPLOYMENT_PULL_IMAGES", false),

  s3Endpoint: process.env.S3_ENDPOINT,
  s3Region: process.env.S3_REGION,
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  s3Bucket: process.env.S3_BUCKET,
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE,
  largePayloadThresholdBytes: process.env.LARGE_PAYLOAD_THRESHOLD_BYTES,
};
