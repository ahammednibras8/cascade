import { taskRunQueueRedis } from "../queue/task-runs.js";
import { createRunEventNotificationSubscriber } from "./run-event-notification-subscriber.js";

const globalForRunEventNotifications = globalThis as unknown as {
  runEventNotificationSubscriber?: ReturnType<typeof createRunEventNotificationSubscriber>;
};

function createRedisSubscriber() {
  const subscriber = taskRunQueueRedis.duplicate();

  subscriber.on("error", (error: unknown) => {
    process.stderr.write(
      `Run event Redis subscriber error: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
  });

  return subscriber;
}

export const runEventNotificationSubscriber =
  globalForRunEventNotifications.runEventNotificationSubscriber ??
  createRunEventNotificationSubscriber(createRedisSubscriber());

if (process.env.NODE_ENV !== "production") {
  globalForRunEventNotifications.runEventNotificationSubscriber = runEventNotificationSubscriber;
}
