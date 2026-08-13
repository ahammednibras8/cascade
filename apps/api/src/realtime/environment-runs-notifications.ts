import { taskRunQueueRedis } from "../queue/task-runs.js";
import { createEnvironmentRunsNotificationSubscriber } from "./environment-runs-notification-subscriber.js";

const globalForEnvironmentRunsNotifications = globalThis as unknown as {
  environmentRunsNotificationSubscriber?: ReturnType<
    typeof createEnvironmentRunsNotificationSubscriber
  >;
};

function createRedisSubscriber() {
  const subscriber = taskRunQueueRedis.duplicate();

  subscriber.on("error", (error: unknown) => {
    process.stderr.write(
      `Environment runs Redis subscriber error: ${
        error instanceof Error ? error.stack : String(error)
      }\n`,
    );
  });

  return subscriber;
}

export const environmentRunsNotificationSubscriber =
  globalForEnvironmentRunsNotifications.environmentRunsNotificationSubscriber ??
  createEnvironmentRunsNotificationSubscriber(createRedisSubscriber());

if (process.env.NODE_ENV !== "production") {
  globalForEnvironmentRunsNotifications.environmentRunsNotificationSubscriber =
    environmentRunsNotificationSubscriber;
}
