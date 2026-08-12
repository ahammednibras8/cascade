import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown[]>>());
const updateMany = vi.hoisted(() => vi.fn<(input: unknown) => Promise<{ count: number }>>());
const publish = vi.hoisted(() => vi.fn<(channel: string, message: string) => Promise<number>>());

const prisma = vi.hoisted(() => ({
  runEventOutbox: {
    findMany,
    updateMany,
  },
}));

const taskRunQueueRedis = vi.hoisted(() => ({
  publish,
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

vi.mock("@cascade/core", () => ({
  getRunEventChannel: (runId: string) => `cascade:realtime:run:${runId}`,
  serializeRunEventNotification: (notification: { eventId: string }) =>
    JSON.stringify(notification),
}));

vi.mock("../../src/queue/task-runs.js", () => ({
  taskRunQueueRedis,
}));

const { dispatchRunEventOutbox } =
  await import("../../src/realtime/run-event-outbox-dispatcher.js");

const NOW = new Date("2026-08-12T00:00:00.000Z");
const LOCK_OWNER = "dispatcher-test-owner";
const OUTBOX_ID = 1n;
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

describe("dispatchRunEventOutbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    findMany.mockResolvedValue([
      {
        id: OUTBOX_ID,
        taskEvent: {
          id: EVENT_ID,
          taskRunId: RUN_ID,
        },
      },
    ]);

    updateMany.mockResolvedValue({
      count: 1,
    });

    publish.mockResolvedValue(1);
  });

  it("claims, publishes, and marks an outbox entry as published", async () => {
    await expect(
      dispatchRunEventOutbox({
        now: NOW,
        lockOwner: LOCK_OWNER,
      }),
    ).resolves.toBe(1);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        publishedAt: null,
        OR: [
          {
            lockedAt: null,
          },
          {
            lockedAt: {
              lt: new Date("2026-08-11T23:59:30.000Z"),
            },
          },
        ],
      },
      orderBy: {
        id: "asc",
      },
      take: 100,
      select: {
        id: true,
        taskEvent: {
          select: {
            id: true,
            taskRunId: true,
          },
        },
      },
    });

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: OUTBOX_ID,
        publishedAt: null,
        OR: [
          {
            lockedAt: null,
          },
          {
            lockedAt: {
              lt: new Date("2026-08-11T23:59:30.000Z"),
            },
          },
        ],
      },
      data: {
        lockedAt: NOW,
        lockOwner: LOCK_OWNER,
      },
    });

    expect(publish).toHaveBeenCalledWith(
      "cascade:realtime:run:22222222-2222-4222-8222-222222222222",
      '{"eventId":"33333333-3333-4333-8333-333333333333"}',
    );

    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: OUTBOX_ID,
        publishedAt: null,
        lockOwner: LOCK_OWNER,
      },
      data: {
        publishedAt: NOW,
        publishAttempts: {
          increment: 1,
        },
        lockedAt: null,
        lockOwner: null,
      },
    });
  });

  it("does not publish an entry another dispatcher claimed", async () => {
    updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      dispatchRunEventOutbox({
        now: NOW,
        lockOwner: LOCK_OWNER,
      }),
    ).resolves.toBe(0);

    expect(publish).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("unlocks the entry and records the failed publish attempt", async () => {
    publish.mockRejectedValue(new Error("Redis unavailable"));

    await expect(
      dispatchRunEventOutbox({
        now: NOW,
        lockOwner: LOCK_OWNER,
      }),
    ).rejects.toThrow("Redis unavailable");

    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: OUTBOX_ID,
        publishedAt: null,
        lockOwner: LOCK_OWNER,
      },
      data: {
        publishAttempts: {
          increment: 1,
        },
        lockedAt: null,
        lockOwner: null,
      },
    });
  });
});
