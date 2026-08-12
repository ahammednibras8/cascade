import { getRunEventChannel, serializeRunEventNotification } from "@cascade/core";
import { randomUUID } from "node:crypto";
import { RUN_EVENT_OUTBOX_LOCK_TIMEOUT_MS } from "../config.js";
import { prisma } from "@cascade/database";
import { taskRunQueueRedis } from "../queue/task-runs.js";

const OUTBOX_BATCH_SIZE = 100;

type DispatchRunEventOutboxInput = {
  now?: Date;
  lockOwner?: string;
};

type DispatchableRunEventOutboxEntry = {
  id: bigint;
  taskEvent: {
    id: string;
    taskRunId: string;
  };
};

function getClaimableOutboxWhere(staleLockCutoff: Date) {
  return {
    publishedAt: null,
    OR: [
      {
        lockedAt: null,
      },
      {
        lockedAt: {
          lt: staleLockCutoff,
        },
      },
    ],
  };
}

async function dispatchRunEventOutboxEntry(input: {
  entry: DispatchableRunEventOutboxEntry;
  now: Date;
  lockOwner: string;
  staleLockCutoff: Date;
}): Promise<number> {
  const claimed = await prisma.runEventOutbox.updateMany({
    where: {
      id: input.entry.id,
      ...getClaimableOutboxWhere(input.staleLockCutoff),
    },
    data: {
      lockedAt: input.now,
      lockOwner: input.lockOwner,
    },
  });

  if (claimed.count !== 1) {
    return 0;
  }

  try {
    await taskRunQueueRedis.publish(
      getRunEventChannel(input.entry.taskEvent.taskRunId),
      serializeRunEventNotification({
        eventId: input.entry.taskEvent.id,
      }),
    );

    await prisma.runEventOutbox.updateMany({
      where: {
        id: input.entry.id,
        publishedAt: null,
        lockOwner: input.lockOwner,
      },
      data: {
        publishedAt: input.now,
        publishAttempts: {
          increment: 1,
        },
        lockedAt: null,
        lockOwner: null,
      },
    });

    return 1;
  } catch (error) {
    await prisma.runEventOutbox.updateMany({
      where: {
        id: input.entry.id,
        publishedAt: null,
        lockOwner: input.lockOwner,
      },
      data: {
        publishAttempts: {
          increment: 1,
        },
        lockedAt: null,
        lockOwner: null,
      },
    });

    throw error;
  }
}

export async function dispatchRunEventOutbox(input: DispatchRunEventOutboxInput = {}) {
  const now = input.now ?? new Date();
  const lockOwner = input.lockOwner ?? randomUUID();
  const staleLockCutoff = new Date(now.getTime() - RUN_EVENT_OUTBOX_LOCK_TIMEOUT_MS);

  const entries = await prisma.runEventOutbox.findMany({
    where: getClaimableOutboxWhere(staleLockCutoff),
    orderBy: {
      id: "asc",
    },
    take: OUTBOX_BATCH_SIZE,
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

  const publishedCounts = await Promise.all(
    entries.map((entry) =>
      dispatchRunEventOutboxEntry({
        entry,
        now,
        lockOwner,
        staleLockCutoff,
      }),
    ),
  );

  return publishedCounts.reduce((total, count) => total + count, 0);
}
