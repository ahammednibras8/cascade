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

const { checkApiReadiness } = await import("../../src/health/api-readiness.js");

describe("checkApiReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HEALTHCHECK_DEPENDENCY_TIMEOUT_MS;

    dependencies.queryRaw.mockResolvedValue([{ ok: 1 }]);
    dependencies.ping.mockResolvedValue("PONG");
  });

  it("is ready when PostgreSQL and Redis are available", async () => {
    await expect(checkApiReadiness()).resolves.toEqual({
      ok: true,
      dependencies: {
        database: "ok",
        redis: "ok",
      },
    });

    expect(dependencies.queryRaw).toHaveBeenCalledOnce();
    expect(dependencies.ping).toHaveBeenCalledOnce();
  });

  it("is not ready when PostgreSQL is unavailable", async () => {
    dependencies.queryRaw.mockRejectedValue(new Error("PostgreSQL unavailable"));

    await expect(checkApiReadiness()).resolves.toEqual({
      ok: false,
      dependencies: {
        database: "unavailable",
        redis: "ok",
      },
    });
  });

  it("is not ready when Redis is unavailable", async () => {
    dependencies.ping.mockRejectedValue(new Error("Redis unavailable"));

    await expect(checkApiReadiness()).resolves.toEqual({
      ok: false,
      dependencies: {
        database: "ok",
        redis: "unavailable",
      },
    });
  });
});
