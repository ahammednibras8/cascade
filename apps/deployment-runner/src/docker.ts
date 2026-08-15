import { spawn } from "node:child_process";

class DockerCommandError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DockerCommandError";
  }
}

export async function runDocker(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);

    child.once("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new DockerCommandError(
          exitCode ?? 1,
          stderr.trim() || `docker command failed with exit code ${exitCode ?? 1}`,
        ),
      );
    });
  });
}

export async function inspectContainer(name: string) {
  try {
    const output = await runDocker([
      "inspect",
      "--format",
      "{{.Id}} {{.State.Running}} {{.State.Restarting}}",
      name,
    ]);

    const [id, running, restarting] = output.split(" ");

    if (!id) {
      return null;
    }

    return {
      id,
      running: running === "true",
      restarting: restarting === "true",
    };
  } catch (error) {
    if (error instanceof DockerCommandError && error.exitCode === 1) {
      return null;
    }

    throw error;
  }
}

export async function removeContainer(name: string) {
  const container = await inspectContainer(name);

  if (!container) {
    return;
  }

  if (container.running) {
    await runDocker(["stop", "--time", "30", name]);
  }

  await runDocker(["rm", "--force", name]);
}
