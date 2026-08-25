const CREATED_AT = "2026-01-01T00:00:00.000Z";

const EXECUTION_CONFIG = {
  schemaVersion: 1,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    exponentialBackoff: true,
  },
  queue: {
    name: "hello",
    concurrencyLimit: 2,
  },
};

export function createDeploymentBody(
  input: {
    version?: string;
    image?: string;
  } = {},
) {
  return {
    version: input.version ?? "v1",
    image: input.image ?? "ghcr.io/cascade/worker:v1",
    tasks: [
      {
        slug: "hello",
        name: "Hello",
        executionConfig: EXECUTION_CONFIG,
      },
    ],
  };
}

export function createDeploymentSuccess() {
  return {
    ok: true,
    status: 201,
    deployment: {
      id: "deployment-1",
      environmentId: "environment-1",
      version: "v1",
      image: "ghcr.io/cascade/worker:v1",
      status: "ACTIVE",
      tasks: [
        {
          id: "task-1",
          slug: "hello",
          name: "Hello",
        },
      ],
      createdAt: CREATED_AT,
    },
  };
}

export function createDeploymentVersionExistsFailure() {
  return {
    ok: false,
    status: 409,
    error: {
      code: "DEPLOYMENT_VERSION_EXISTS",
      message: "A deployment with this version already exists in the environment",
    },
  };
}
