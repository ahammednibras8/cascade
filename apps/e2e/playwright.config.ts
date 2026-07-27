import { defineConfig, devices } from "@playwright/test";
import * as process from "node:process";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../api", import.meta.url));
const dashboardDir = fileURLToPath(new URL("../dashboard", import.meta.url));
const workerDir = fileURLToPath(new URL("../../packages/worker", import.meta.url));

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const apiURL = process.env.CASCADE_API_URL ?? "http://localhost:3001";
const databaseURL =
  process.env.DATABASE_URL ?? "postgresql://cascade:cascade@localhost:15432/cascade";
const queueRedisURL = process.env.QUEUE_REDIS_URL ?? "redis://localhost:16379";
const apiKeyPepper = process.env.API_KEY_PEPPER ?? "dev-api-key-pepper-change-me";

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);

const serverEnv = {
  ...inheritedEnv,
  NODE_OPTIONS: "--conditions=development",
  DATABASE_URL: databaseURL,
  QUEUE_REDIS_URL: queueRedisURL,
  API_KEY_PEPPER: apiKeyPepper,
};

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      name: "api",
      command: "node --env-file=../../.env --conditions=development --import tsx src/index.ts",
      cwd: apiDir,
      url: `${apiURL}/healthz`,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVERS === "true",
      timeout: 120_000,
      env: serverEnv,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: {
        signal: "SIGINT",
        timeout: 5_000,
      },
    },
    {
      name: "worker",
      command: "node --env-file=../../.env --conditions=development --import tsx src/index.ts",
      cwd: workerDir,
      wait: {
        stdout: /Starting worker with @cascade\/core/,
      },
      timeout: 120_000,
      env: serverEnv,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: {
        signal: "SIGINT",
        timeout: 5_000,
      },
    },
    {
      name: "dashboard",
      command:
        "node --env-file=../../.env --conditions=development ./node_modules/@react-router/dev/bin.cjs dev --port 3000 --strictPort",
      cwd: dashboardDir,
      url: baseURL,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVERS === "true",
      timeout: 120_000,
      env: serverEnv,
      stdout: "pipe",
      stderr: "ignore",
      gracefulShutdown: {
        signal: "SIGINT",
        timeout: 5_000,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  outputDir: "test-results",
});
