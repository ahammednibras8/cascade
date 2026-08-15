import { taskRunQueueRedis } from "../queue/task-runs.js";
import { createEnvironmentRunsNotificationSubscriber } from "./environment-runs-notification-subscriber.js";

function createRedisSubscriber() {
  const subscriber = taskRunQueueRedis.duplicate();

  subscriber.on("error", () => {});

  return subscriber;
}

type EnvironmentRunsNotifications = {
  redisSubscriber: ReturnType<typeof createRedisSubscriber>;
  notificationSubscriber: ReturnType<typeof createEnvironmentRunsNotificationSubscriber>;
};

const globalForEnvironmentRunsNotifications = globalThis as unknown as {
  environmentRunsNotifications?: EnvironmentRunsNotifications;
};

function createEnvironmentRunsNotifications(): EnvironmentRunsNotifications {
  const redisSubscriber = createRedisSubscriber();

  return {
    redisSubscriber,
    notificationSubscriber: createEnvironmentRunsNotificationSubscriber(redisSubscriber),
  };
}

const environmentRunsNotifications =
  globalForEnvironmentRunsNotifications.environmentRunsNotifications ??
  createEnvironmentRunsNotifications();

export const environmentRunsNotificationSubscriber =
  environmentRunsNotifications.notificationSubscriber;

if (process.env.NODE_ENV !== "production") {
  globalForEnvironmentRunsNotifications.environmentRunsNotifications = environmentRunsNotifications;
}

export function disconnectEnvironmentRunsNotificationSubscriber() {
  environmentRunsNotifications.redisSubscriber.disconnect();
}
