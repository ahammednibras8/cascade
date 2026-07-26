import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  taskRun: {
    updateMany: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { startTaskRunHeartbeat } = await import("../timers/task-run-heartbeat.js");

describe("startTaskRunHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    vi.clearAllMocks();

    prisma.taskRun.updateMany.mockResolvedValue({
      count: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates lastHeartbeatAt for an executing task run", async () => {
    const stopHeartbeat = startTaskRunHeartbeat("run-1");

    await vi.advanceTimersByTimeAsync(5000);

    expect(prisma.taskRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        status: "EXECUTING",
      },
      data: {
        lastHeartbeatAt: new Date("2026-01-01T00:00:05.000Z"),
      },
    });

    stopHeartbeat();
  });

  it("stops updating heartbeat after cleanup", async () => {
    const stopHeartbeat = startTaskRunHeartbeat("run-1");

    stopHeartbeat();

    await vi.advanceTimersByTimeAsync(5000);

    expect(prisma.taskRun.updateMany).not.toHaveBeenCalled();
  });
});
