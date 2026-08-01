import { beforeEach, describe, expect, it, vi } from "vitest";

const appsApi = vi.hoisted(() => ({
  createNamespacedDeployment: vi.fn<(args: unknown) => Promise<{ metadata?: { uid?: string } }>>(),
  readNamespacedDeployment: vi.fn<(args: unknown) => Promise<unknown>>(),
  deleteNamespacedDeployment: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

const loadFromCluster = vi.hoisted(() => vi.fn<() => void>());
const makeApiClient = vi.hoisted(() => vi.fn<() => typeof appsApi>());

vi.mock("@kubernetes/client-node", () => ({
  AppsV1Api: function AppsV1Api() {
    return appsApi;
  },
  KubeConfig: class KubeConfig {
    loadFromCluster() {
      loadFromCluster();
    }

    makeApiClient() {
      return makeApiClient();
    }
  },
}));

vi.mock("../src/config.js", () => ({
  deploymentRunnerConfig: {
    kubernetesNamespace: "cascade",
    kubernetesRuntimeSecretName: "cascade-runtime",
  },
}));

const { createKubernetesDeploymentRuntime } = await import("../src/kubernetes-runtime.js");

function createNotFoundError() {
  return {
    response: {
      statusCode: 404,
    },
  };
}

function getCreatedDeployment() {
  const call = appsApi.createNamespacedDeployment.mock.calls.at(-1);

  if (!call) {
    throw new Error("Kubernetes deployment was not created");
  }

  return call[0] as {
    namespace: string;
    body: {
      metadata?: {
        name?: string;
      };
      spec?: {
        template?: {
          spec?: {
            containers?: Array<{
              image?: string;
              env?: Array<{ name: string; value: string }>;
              envFrom?: Array<{ secretRef?: { name?: string } }>;
            }>;
          };
        };
      };
    };
  };
}

describe("createKubernetesDeploymentRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    makeApiClient.mockReturnValue(appsApi);
    appsApi.createNamespacedDeployment.mockResolvedValue({
      metadata: {
        uid: "worker-uid",
      },
    });
    appsApi.readNamespacedDeployment.mockResolvedValue({
      metadata: {
        uid: "worker-uid",
      },
    });
    appsApi.deleteNamespacedDeployment.mockResolvedValue({});
  });

  it("starts a deployment worker using the runtime secret and deployment env", async () => {
    const runtime = createKubernetesDeploymentRuntime();

    const workerId = await runtime.start({
      deploymentId: "deployment-1",
      image: "cascade-worker:v1",
      environment: {
        WORKER_CONCURRENCY: "3",
      },
    });

    expect(loadFromCluster).toHaveBeenCalledOnce();
    expect(workerId).toBe("worker-uid");

    const createdDeployment = getCreatedDeployment();
    const container = createdDeployment.body.spec?.template?.spec?.containers?.[0];

    expect(createdDeployment.namespace).toBe("cascade");
    expect(createdDeployment.body.metadata?.name).toBe("cascade-deployment-deployment-1");
    expect(container).toEqual(
      expect.objectContaining({
        image: "cascade-worker:v1",
        envFrom: [
          {
            secretRef: {
              name: "cascade-runtime",
            },
          },
        ],
        env: expect.arrayContaining([
          {
            name: "CASCADE_WORKER_ROLE",
            value: "deployment",
          },
          {
            name: "CASCADE_DEPLOYMENT_ID",
            value: "deployment-1",
          },
          {
            name: "WORKER_CONCURRENCY",
            value: "3",
          },
        ]),
      }),
    );
  });

  it("reports missing deployments as absent", async () => {
    appsApi.readNamespacedDeployment.mockRejectedValueOnce(createNotFoundError());

    const runtime = createKubernetesDeploymentRuntime();

    await expect(runtime.inspect("deployment-1")).resolves.toBeNull();
  });

  it("removes a deployment and returns once Kubernetes reports it missing", async () => {
    appsApi.readNamespacedDeployment.mockRejectedValueOnce(createNotFoundError());

    const runtime = createKubernetesDeploymentRuntime();

    await runtime.remove("deployment-1");

    expect(appsApi.deleteNamespacedDeployment).toHaveBeenCalledWith({
      name: "cascade-deployment-deployment-1",
      namespace: "cascade",
      gracePeriodSeconds: 30,
      propagationPolicy: "Foreground",
    });
    expect(appsApi.readNamespacedDeployment).toHaveBeenCalledWith({
      name: "cascade-deployment-deployment-1",
      namespace: "cascade",
    });
  });
});
