import type { Prisma } from "./generated/prisma/client.js";

type EventTransactionClient = Pick<Prisma.TransactionClient, "taskEvent" | "runEventOutbox">;

export type CreateTaskRunEventInput = Prisma.TaskEventCreateArgs["data"];

export async function createTaskRunEvent(
  tx: EventTransactionClient,
  data: CreateTaskRunEventInput,
) {
  const event = await tx.taskEvent.create({
    data,
    select: {
      id: true,
    },
  });

  await tx.runEventOutbox.create({
    data: {
      taskEventId: event.id,
    },
  });

  return event;
}
