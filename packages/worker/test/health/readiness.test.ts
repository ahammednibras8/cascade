import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  queryRaw: vi.fn<() => Promise<unknown>>(),
  queueRedisPing: vi.fn<() => Promise<unknown>>(),
  healthRedisPing: vi.fn<() => Promise<unknown>>(),
  healthRedisDisconnect: vi.fn<() => void>(),
  duplicateQueueRedis: vi.fn<
    (options: { lazyConnect: boolean; maxRetriesPerRequest: null }) => {
      ping: () => Promise<unknown>;
      disconnect: () => void;
    }
  >(),
}));

vi.mock("@cascade/database", () => ({
  prisma: {
    $queryRaw: dependencies.queryRaw,
  },
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  taskRunQueueRedis: {
    ping: dependencies.queueRedisPing,
    duplicate: dependencies.duplicateQueueRedis,
  },
}));

dependencies.duplicateQueueRedis.mockReturnValue({
  ping: dependencies.healthRedisPing,
  disconnect: dependencies.healthRedisDisconnect,
});

const { checkWorkerReadiness, stopWorkerReadinessChecks } =
  await import("../../src/health/readiness.js");
const { createWorkerHealthState } = await import("../../src/health/state.js");

describe("checkWorkerReadiness", () => {
  beforeEach(() => {
    dependencies.queryRaw.mockClear();
    dependencies.queueRedisPing.mockClear();
    dependencies.healthRedisPing.mockClear();
    dependencies.healthRedisDisconnect.mockClear();

    dependencies.queryRaw.mockResolvedValue([{ ok: 1 }]);
    dependencies.queueRedisPing.mockResolvedValue("PONG");
    dependencies.healthRedisPing.mockResolvedValue("PONG");
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

    dependencies.healthRedisPing.mockRejectedValue(new Error("Redis unavailable"));

    await expect(checkWorkerReadiness(healthState)).resolves.toEqual({
      ok: false,
      worker: "ready",
      dependencies: {
        database: "ok",
        redis: "unavailable",
      },
    });
  });

  it("uses a dedicated Redis connection for readiness checks", async () => {
    const healthState = createWorkerHealthState();
    healthState.markReady();

    await checkWorkerReadiness(healthState);
    stopWorkerReadinessChecks();

    expect(dependencies.duplicateQueueRedis).toHaveBeenCalledWith({
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    expect(dependencies.queueRedisPing).not.toHaveBeenCalled();
    expect(dependencies.healthRedisPing).toHaveBeenCalledOnce();
    expect(dependencies.healthRedisDisconnect).toHaveBeenCalledOnce();
  });
});
