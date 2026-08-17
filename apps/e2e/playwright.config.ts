import { defineConfig, devices } from "@playwright/test";
import * as process from "node:process";
import { fileURLToPath } from "node:url";

const explicitBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const explicitApiURL = process.env.CASCADE_API_URL;
const explicitDashboardApiKey = process.env.CASCADE_DASHBOARD_API_KEY;
const explicitReuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVERS;

const rootEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));
process.loadEnvFile(rootEnvPath);

const apiDir = fileURLToPath(new URL("../api", import.meta.url));
const dashboardDir = fileURLToPath(new URL("../dashboard", import.meta.url));
const workerDir = fileURLToPath(new URL("../../packages/worker", import.meta.url));

const dashboardStorageStatePath = fileURLToPath(
  new URL("./.auth/dashboard-session.json", import.meta.url),
);

const databaseURL =
  process.env.DATABASE_URL ?? "postgresql://cascade:cascade@localhost:15432/cascade";
const queueRedisURL = process.env.QUEUE_REDIS_URL ?? "redis://localhost:16379";
const apiKeyPepper = process.env.API_KEY_PEPPER ?? "dev-api-key-pepper-change-me";
const reuseExistingServer = explicitReuseExistingServer === "true";
const baseURL =
  explicitBaseURL ??
  (reuseExistingServer
    ? (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")
    : "http://localhost:3100");
const apiURL =
  explicitApiURL ??
  (reuseExistingServer
    ? (process.env.CASCADE_API_URL ?? "http://localhost:3001")
    : "http://localhost:3101");
const dashboardApiKey =
  explicitDashboardApiKey ??
  (reuseExistingServer
    ? (process.env.CASCADE_DASHBOARD_API_KEY ?? "csc_e2e_dashboard_test_key")
    : "csc_e2e_dashboard_test_key");
const dashboardSessionSecret =
  process.env.DASHBOARD_SESSION_SECRET ??
  "e2e-dashboard-session-secret-change-me-at-least-32-characters";

const dashboardApiAuthSecret =
  process.env.DASHBOARD_API_AUTH_SECRET ??
  "e2e-dashboard-api-auth-secret-change-me-at-least-32-characters";

function ensureNodeOption(value: string | undefined, option: string) {
  const options = value?.split(/\s+/).filter(Boolean) ?? [];

  if (!options.includes(option)) {
    options.push(option);
  }

  return options.join(" ");
}

const nodeOptions = ensureNodeOption(process.env.NODE_OPTIONS, "--conditions=development");

process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.CASCADE_API_URL = apiURL;
process.env.CASCADE_DASHBOARD_API_KEY = dashboardApiKey;
process.env.DASHBOARD_SESSION_SECRET = dashboardSessionSecret;
process.env.DATABASE_URL = databaseURL;
process.env.QUEUE_REDIS_URL = queueRedisURL;
process.env.PLAYWRIGHT_DASHBOARD_STORAGE_STATE = dashboardStorageStatePath;
process.env.NODE_OPTIONS = nodeOptions;
process.env.DASHBOARD_API_AUTH_SECRET = dashboardApiAuthSecret;

function getUrlPort(url: string, fallbackPort: string) {
  const parsed = new URL(url);

  return parsed.port || fallbackPort;
}

const apiPort = getUrlPort(apiURL, "80");
const dashboardPort = getUrlPort(baseURL, "80");

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);

const serverEnv = {
  ...inheritedEnv,
  NODE_ENV: "test",
  NODE_OPTIONS: nodeOptions,
  DATABASE_URL: databaseURL,
  QUEUE_REDIS_URL: queueRedisURL,
  DASHBOARD_SESSION_SECRET: dashboardSessionSecret,
  API_PORT: apiPort,
  WORKER_HEALTH_PORT: process.env.PLAYWRIGHT_WORKER_HEALTH_PORT ?? "3003",
  API_KEY_PEPPER: apiKeyPepper,
  CASCADE_API_URL: apiURL,
  CASCADE_DASHBOARD_API_KEY: dashboardApiKey,
  DASHBOARD_API_AUTH_SECRET: dashboardApiAuthSecret,
};

const controlWorkerEnv = {
  ...serverEnv,
  CASCADE_WORKER_ROLE: "control",
  WORKER_HEALTH_PORT: process.env.PLAYWRIGHT_CONTROL_WORKER_HEALTH_PORT ?? "3004",
};

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/support/dashboard-auth.global-setup.ts",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    storageState: dashboardStorageStatePath,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      name: "api",
      command: "node --env-file=../../.env --conditions=development --import tsx src/index.ts",
      cwd: apiDir,
      url: `${apiURL}/readyz`,
      reuseExistingServer,
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
        stdout: /Starting (?:local |control )?worker with @cascade\/core/,
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
      command: `node --env-file=../../.env --conditions=development ./node_modules/@react-router/dev/bin.cjs dev --port ${dashboardPort} --strictPort`,
      cwd: dashboardDir,
      url: `${baseURL}/readyz`,
      reuseExistingServer,
      timeout: 120_000,
      env: serverEnv,
      stdout: "pipe",
      stderr: "ignore",
      gracefulShutdown: {
        signal: "SIGINT",
        timeout: 5_000,
      },
    },
    {
      name: "worker-control",
      command: "node --env-file=../../.env --conditions=development --import tsx src/index.ts",
      cwd: workerDir,
      wait: {
        stdout: /Starting control worker with @cascade\/core/,
      },
      timeout: 120_000,
      env: controlWorkerEnv,
      stdout: "pipe",
      stderr: "pipe",
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
