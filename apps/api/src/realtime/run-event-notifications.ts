import { taskRunQueueRedis } from "../queue/task-runs.js";
import { createRunEventNotificationSubscriber } from "./run-event-notification-subscriber.js";

const globalForRunEventNotifications = globalThis as unknown as {
  runEventNotificationSubscriber?: ReturnType<typeof createRunEventNotificationSubscriber>;
};

function createRedisSubscriber() {
  const subscriber = taskRunQueueRedis.duplicate();

  subscriber.on("error", () => {});

  return subscriber;
}

export const runEventNotificationSubscriber =
  globalForRunEventNotifications.runEventNotificationSubscriber ??
  createRunEventNotificationSubscriber(createRedisSubscriber());

if (process.env.NODE_ENV !== "production") {
  globalForRunEventNotifications.runEventNotificationSubscriber = runEventNotificationSubscriber;
}
