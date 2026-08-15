import { deploymentRunnerConfig } from "./config.js";
import { dockerDeploymentRuntime } from "./docker-runtime.js";
import { createKubernetesDeploymentRuntime } from "./kubernetes-runtime.js";

export const deploymentRuntime =
  deploymentRunnerConfig.runtime === "kubernetes"
    ? createKubernetesDeploymentRuntime()
    : dockerDeploymentRuntime;
