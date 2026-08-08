import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  queryRaw: vi.fn<() => Promise<unknown>>(),
  ping: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@cascade/database", () => ({
  prisma: {
    $queryRaw: dependencies.queryRaw,
  },
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  taskRunQueueRedis: {
    ping: dependencies.ping,
  },
}));

const { checkWorkerReadiness } = await import("../../src/health/readiness.js");
const { createWorkerHealthState } = await import("../../src/health/state.js");

describe("checkWorkerReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dependencies.queryRaw.mockResolvedValue([{ ok: 1 }]);
    dependencies.ping.mockResolvedValue("PONG");
  });

  it("is not ready while worker initialization is incomplete", async () => {
    const healthState = createWorkerHealthState();

    await expect(checkWorkerReadiness(healthState)).resolves.toEqual({
      ok: false,
      worker: "starting",
      dependencies: {
        database: "ok",
        redis: "ok",
      },
    });
  });

  it("is ready after initialization when PostgreSQL and Redis are available", async () => {
    const healthState = createWorkerHealthState();
    healthState.markReady();

    await expect(checkWorkerReadiness(healthState)).resolves.toEqual({
      ok: true,
      worker: "ready",
      dependencies: {
        database: "ok",
        redis: "ok",
      },
    });
  });

  it("is not ready when Redis is unavailable", async () => {
    const healthState = createWorkerHealthState();
    healthState.markReady();

    dependencies.ping.mockRejectedValue(new Error("Redis unavailable"));

    await expect(checkWorkerReadiness(healthState)).resolves.toEqual({
      ok: false,
      worker: "ready",
      dependencies: {
        database: "ok",
        redis: "unavailable",
      },
    });
  });
});
