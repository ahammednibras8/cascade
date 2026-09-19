import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerReadiness } from "../../src/health/readiness.js";

const dependencies = vi.hoisted(() => ({
  checkWorkerReadiness: vi.fn<() => Promise<WorkerReadiness>>(async () => ({
    ok: true,
    worker: "ready",
    dependencies: {
      database: "ok",
      redis: "ok",
    },
  })),
  stopWorkerReadinessChecks: vi.fn<() => void>(),
}));

vi.mock("@cascade/core", () => ({
  packageName: "@cascade/worker",
}));

vi.mock("../../src/config.js", () => ({
  WORKER_HEALTH_HOST: "127.0.0.1",
  WORKER_HEALTH_PORT: 0,
}));

vi.mock("../../src/health/readiness.js", () => ({
  checkWorkerReadiness: dependencies.checkWorkerReadiness,
  stopWorkerReadinessChecks: dependencies.stopWorkerReadinessChecks,
}));

vi.stubEnv("CASCADE_WORKER_VERSION", "0.1.0");
vi.stubEnv("CASCADE_WORKER_REVISION", "0123456789abcdef");

const { startWorkerHealthServer, stopWorkerHealthServer } =
  await import("../../src/health/server.js");
const { createWorkerHealthState } = await import("../../src/health/state.js");

describe("worker health server", () => {
  let server: Awaited<ReturnType<typeof startWorkerHealthServer>> | undefined;

  afterEach(async () => {
    if (server) {
      await stopWorkerHealthServer(server);
      server = undefined;
    }

    dependencies.checkWorkerReadiness.mockClear();
    dependencies.stopWorkerReadinessChecks.mockClear();
  });

  it("reports the worker image version and revision", async () => {
    server = await startWorkerHealthServer(createWorkerHealthState());

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/livez`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "@cascade/worker",
      build: {
        version: "0.1.0",
        revision: "0123456789abcdef",
      },
    });
  });
});
