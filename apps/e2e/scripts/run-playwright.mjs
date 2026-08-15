import { spawn } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);

if (args[0] === "--") {
  args.shift();
}

const child = spawn("playwright", ["test", ...args], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
