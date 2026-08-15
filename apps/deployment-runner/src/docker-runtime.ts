import { deploymentRunnerConfig } from "./config.js";
import { inspectContainer, removeContainer, runDocker } from "./docker.js";
import type { DeploymentWorkerRuntime, StartDeploymentWorkerInput } from "./runtime.js";

function getContainerName(deploymentId: string) {
  return `cascade-deployment-${deploymentId}`;
}

async function startDeploymentWorker(input: StartDeploymentWorkerInput) {
  if (deploymentRunnerConfig.pullImages) {
    await runDocker(["pull", input.image]);
  }

  const dockerNetwork = deploymentRunnerConfig.dockerNetwork;

  if (!dockerNetwork) {
    throw new Error("DEPLOYMENT_DOCKER_NETWORK is required for Docker runtime");
  }

  const dockerArgs = [
    "run",
    "--detach",
    "--name",
    getContainerName(input.deploymentId),
    "--label",
    "cascade.managed=true",
    "--label",
    `cascade.deployment-id=${input.deploymentId}`,
    "--network",
    dockerNetwork,
    "--restart",
    "unless-stopped",
  ];

  for (const [name, value] of Object.entries(input.environment)) {
    dockerArgs.push("--env", `${name}=${value}`);
  }

  dockerArgs.push(input.image);

  return runDocker(dockerArgs);
}

export const dockerDeploymentRuntime: DeploymentWorkerRuntime = {
  inspect(deploymentId) {
    return inspectContainer(getContainerName(deploymentId));
  },

  start(input) {
    return startDeploymentWorker(input);
  },

  remove(deploymentId) {
    return removeContainer(getContainerName(deploymentId));
  },
};
