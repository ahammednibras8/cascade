import { taskRunQueueRedis } from "../queue/task-runs.js";
import { createRunEventNotificationSubscriber } from "./run-event-notification-subscriber.js";

function createRedisSubscriber() {
  const subscriber = taskRunQueueRedis.duplicate();

  subscriber.on("error", () => {});

  return subscriber;
}

type RunEventNotifications = {
  redisSubscriber: ReturnType<typeof createRedisSubscriber>;
  notificationSubscriber: ReturnType<typeof createRunEventNotificationSubscriber>;
};

const globalForRunEventNotifications = globalThis as unknown as {
  runEventNotifications?: RunEventNotifications;
};

function createRunEventNotifications(): RunEventNotifications {
  const redisSubscriber = createRedisSubscriber();

  return {
    redisSubscriber,
    notificationSubscriber: createRunEventNotificationSubscriber(redisSubscriber),
  };
}

const runEventNotifications =
  globalForRunEventNotifications.runEventNotifications ?? createRunEventNotifications();

export const runEventNotificationSubscriber = runEventNotifications.notificationSubscriber;

if (process.env.NODE_ENV !== "production") {
  globalForRunEventNotifications.runEventNotifications = runEventNotifications;
}

export function disconnectRunEventNotificationSubscriber() {
  runEventNotifications.redisSubscriber.disconnect();
}
