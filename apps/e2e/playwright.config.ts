import { defineConfig, devices } from "@playwright/test";
import * as process from "node:process";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
    testDir: "./tests",
    timeout: 30_000,
    expect: {
        timeout: 5_000
    },
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    ...(process.env.CI ? {workers: 1} : {}),
    reporter: process.env.CI
        ? [["github"], ["html", { open: "never" }]]
        : [["list"], ["html", { open: "never" }]],
    use: {
        baseURL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ],
    outputDir: "test-results"
});
