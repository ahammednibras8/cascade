export type ExecutionConfig = {
  schemaVersion: number;
  timeoutMs: number | null;
  retry: {
    maxAttempts: number;
    delayMs: number;
    exponentialBackoff: boolean;
  };
  queue: {
    name: string;
    concurrencyLimit: number | null;
  };
};

export type DeploymentTask = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  executionConfig: ExecutionConfig | null;
  createdAt: string;
  updatedAt: string;
  runsCount: number;
  schedulesCount: number;
};

export type DeploymentManifestTask = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  executionConfig: ExecutionConfig;
  createdAt: string;
};

export type Deployment = {
  id: string;
  environmentId: string;
  version: string;
  image: string;
  status: string;
  runtimeStatus: string;
  runtimeError: string | null;
  runtimeStartedAt: string | null;
  runtimeStoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
  runsCount: number;
  canRollback: boolean;
  manifestTasks: DeploymentManifestTask[];
  tasks: DeploymentTask[];
};

export type DeploymentListItem = Omit<Deployment, "canRollback" | "manifestTasks" | "tasks"> & {
  tasksCount: number;
};
