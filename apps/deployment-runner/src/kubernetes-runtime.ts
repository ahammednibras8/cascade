import { AppsV1Api, KubeConfig, type V1Deployment } from "@kubernetes/client-node";
import type { DeploymentWorkerRuntime, StartDeploymentWorkerInput } from "./runtime.js";
import { deploymentRunnerConfig } from "./config.js";

const DELETE_POLL_INTERVAL_MS = 500;
const DELETE_POLL_ATTEMPTS = 60;

function getDeploymentName(deploymentId: string) {
  return `cascade-deployment-${deploymentId}`;
}

function getRuntimeSecretName() {
  const secretName = deploymentRunnerConfig.kubernetesRuntimeSecretName;

  if (!secretName) {
    throw new Error("DEPLOYMENT_KUBERNETES_RUNTIME_SECRET_NAME is required for Kubernetes runtime");
  }

  return secretName;
}

function getApiStatusCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    code?: unknown;
    response?: {
      status?: unknown;
      statusCode?: unknown;
    };
  };

  if (typeof candidate.code === "number") {
    return candidate.code;
  }

  if (typeof candidate.response?.status === "number") {
    return candidate.response.status;
  }

  if (typeof candidate.response?.statusCode === "number") {
    return candidate.response.statusCode;
  }

  return undefined;
}

function isNotFoundError(error: unknown) {
  return getApiStatusCode(error) === 404;
}

function waitForDelay(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function getWorkerConcurrency(input: StartDeploymentWorkerInput) {
  const workerConcurrency = input.environment["WORKER_CONCURRENCY"];

  if (!workerConcurrency) {
    throw new Error("WORKER_CONCURRENCY is required for deployment workers");
  }

  return workerConcurrency;
}

const DEPLOYMENT_WORKER_TELEMETRY_ENVIRONMENT_VARIABLES = [
  "OTEL_ENABLED",
  "OTEL_EXPORTER_MODE",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_DEPLOYMENT_ENVIRONMENT",
  "OTEL_METRIC_EXPORT_INTERVAL_MS",
  "OTEL_SERVICE_NAME",
  "CASCADE_VERSION",
] as const;

function getDeploymentWorkerTelemetryEnvironment(input: StartDeploymentWorkerInput) {
  return DEPLOYMENT_WORKER_TELEMETRY_ENVIRONMENT_VARIABLES.flatMap((name) => {
    const value = input.environment[name];

    return value ? [{ name, value }] : [];
  });
}

function createDeploymentManifest(input: StartDeploymentWorkerInput): V1Deployment {
  const name = getDeploymentName(input.deploymentId);
  const labels = {
    "app.kubernetes.io/name": "cascade-deployment-worker",
    "app.kubernetes.io/component": "deployment-worker",
    "cascade.io/managed": "true",
    "cascade.io/deployment-id": input.deploymentId,
  };

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          "cascade.io/deployment-id": input.deploymentId,
        },
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          automountServiceAccountToken: false,
          terminationGracePeriodSeconds: 30,
          containers: [
            {
              name: "worker",
              image: input.image,
              imagePullPolicy: "IfNotPresent",
              envFrom: [
                {
                  secretRef: {
                    name: getRuntimeSecretName(),
                  },
                },
              ],
              env: [
                {
                  name: "NODE_ENV",
                  value: "production",
                },
                {
                  name: "CASCADE_WORKER_ROLE",
                  value: "deployment",
                },
                {
                  name: "CASCADE_DEPLOYMENT_ID",
                  value: input.deploymentId,
                },
                {
                  name: "WORKER_CONCURRENCY",
                  value: getWorkerConcurrency(input),
                },
                ...getDeploymentWorkerTelemetryEnvironment(input),
              ],
            },
          ],
        },
      },
    },
  };
}

function createAppsApi() {
  const kubeConfig = new KubeConfig();

  kubeConfig.loadFromCluster();

  return kubeConfig.makeApiClient(AppsV1Api);
}

export function createKubernetesDeploymentRuntime(): DeploymentWorkerRuntime {
  const appsApi = createAppsApi();
  const namespace = deploymentRunnerConfig.kubernetesNamespace;

  async function waitUntilDeleted(name: string, attempt = 0): Promise<void> {
    if (attempt >= DELETE_POLL_ATTEMPTS) {
      throw new Error(`Timed out waiting for Kubernetes Deployment ${name} to be deleted`);
    }

    try {
      await appsApi.readNamespacedDeployment({
        name,
        namespace,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }

      throw error;
    }

    await waitForDelay(DELETE_POLL_INTERVAL_MS);
    await waitUntilDeleted(name, attempt + 1);
  }

  return {
    async inspect(deploymentId) {
      const name = getDeploymentName(deploymentId);

      try {
        const deployment = await appsApi.readNamespacedDeployment({
          name,
          namespace,
        });

        if (deployment.metadata?.deletionTimestamp) {
          return {
            id: deployment.metadata.uid ?? name,
            running: false,
            restarting: true,
          };
        }

        return {
          id: deployment.metadata?.uid ?? name,
          running: true,
          restarting: false,
        };
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },

    async start(input) {
      const deployment = await appsApi.createNamespacedDeployment({
        namespace,
        body: createDeploymentManifest(input),
      });

      return deployment.metadata?.uid ?? getDeploymentName(input.deploymentId);
    },

    async remove(deploymentId) {
      const name = getDeploymentName(deploymentId);

      try {
        await appsApi.deleteNamespacedDeployment({
          name,
          namespace,
          gracePeriodSeconds: 30,
          propagationPolicy: "Foreground",
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          return;
        }

        throw error;
      }

      await waitUntilDeleted(name);
    },
  };
}
