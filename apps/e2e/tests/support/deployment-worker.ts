import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

const WORKER_READY_TIMEOUT_MS = 15_000;
const WORKER_STOP_TIMEOUT_MS = 5_000;
const workerDirectory = fileURLToPath(new URL("../../../../packages/worker", import.meta.url));
const starterTaskModule = pathToFileURL(
  fileURLToPath(new URL("../../../../examples/typescript-starter/src/tasks.ts", import.meta.url)),
).href;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getAvailablePort() {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a deployment worker health port");
  }

  return address.port;
}

function collectProcessOutput(child: ChildProcess) {
  let output = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  return () => output;
}

async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = once(child, "exit").then(() => true);

  child.kill("SIGINT");

  if (await Promise.race([exited, delay(WORKER_STOP_TIMEOUT_MS).then(() => false)])) {
    return;
  }

  child.kill("SIGKILL");
  await once(child, "exit");
}

async function waitForWorkerReadiness(
  child: ChildProcess,
  healthPort: number,
  getOutput: () => string,
) {
  const deadline = Date.now() + WORKER_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Deployment worker exited before becoming ready\n${getOutput()}`);
    }

    try {
      // eslint-disable-next-line no-await-in-loop -- Readiness probes must be sequential.
      const response = await fetch(`http://127.0.0.1:${healthPort}/readyz`);

      if (response.ok) {
        return;
      }
    } catch {
      // The worker health server may not be listening yet.
    }

    // eslint-disable-next-line no-await-in-loop -- Avoid overlapping readiness probes.
    await delay(100);
  }

  throw new Error(`Deployment worker did not become ready\n${getOutput()}`);
}

export async function startActivationDeploymentWorker(deploymentId: string) {
  const healthPort = await getAvailablePort();
  const child = spawn(
    process.execPath,
    ["--conditions=development", "--import", "tsx", "src/index.ts"],
    {
      cwd: workerDirectory,
      env: {
        ...process.env,
        NODE_ENV: "test",
        CASCADE_DEPLOYMENT_ID: deploymentId,
        CASCADE_TASK_MODULE: starterTaskModule,
        CASCADE_WORKER_ROLE: "deployment",
        WORKER_HEALTH_HOST: "127.0.0.1",
        WORKER_HEALTH_PORT: String(healthPort),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const getOutput = collectProcessOutput(child);

  try {
    await waitForWorkerReadiness(child, healthPort, getOutput);
  } catch (error) {
    await stopProcess(child);
    throw error;
  }

  return {
    stop: () => stopProcess(child),
  };
}
