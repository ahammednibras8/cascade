import { spawn } from "node:child_process";
import process from "node:process";

const entrypoint = process.argv[2];

if (!entrypoint) {
  process.stderr.write("Usage: node scripts/run-node-watch.mjs <entrypoint>\n");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    "--env-file=../../.env",
    "--conditions=development",
    "--import",
    "tsx",
    "--import",
    "@cascade/telemetry/register",
    "--watch",
    entrypoint,
  ],
  {
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  },
);

let shuttingDown = false;
let forceExitTimer;

function signalChild(signal) {
  if (child.pid === undefined) {
    return;
  }

  try {
    process.kill(process.platform === "win32" ? child.pid : -child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The child already exited.
    }
  }
}

function stopChild(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  signalChild(signal);

  forceExitTimer = setTimeout(() => {
    signalChild("SIGKILL");
    process.exit(0);
  }, 2_000);

  forceExitTimer.unref();
}

process.on("SIGINT", () => {
  stopChild("SIGINT");
});

process.on("SIGTERM", () => {
  stopChild("SIGTERM");
});

child.on("exit", (code, signal) => {
  if (forceExitTimer) {
    clearTimeout(forceExitTimer);
  }

  if (shuttingDown) {
    process.exit(0);
  }

  if (signal) {
    process.exit(1);
  }

  process.exit(code ?? 1);
});
