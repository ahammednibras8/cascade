type RuntimeWorker = {
  id: string;
  running: boolean;
  restarting: boolean;
};

export type StartDeploymentWorkerInput = {
  deploymentId: string;
  image: string;
  environment: Record<string, string>;
};

export type DeploymentWorkerRuntime = {
  inspect(deploymentId: string): Promise<RuntimeWorker | null>;
  start(input: StartDeploymentWorkerInput): Promise<string>;
  remove(deploymentId: string): Promise<void>;
};
