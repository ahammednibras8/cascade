import { getEnvironmentRunsChannel, parseRunEventNotification } from "@cascade/core";
import type { Redis } from "ioredis";

type EnvironmentRunsNotificationListener = (notification: { eventId: string }) => void;

type RedisSubscriptionClient = Pick<Redis, "on" | "subscribe" | "unsubscribe">;

type EnvironmentSubscription = {
  listeners: Set<EnvironmentRunsNotificationListener>;
  subscribed: boolean;
  subscribePromise: Promise<void> | null;
};

export function createEnvironmentRunsNotificationSubscriber(redis: RedisSubscriptionClient) {
  const subscriptions = new Map<string, EnvironmentSubscription>();

  redis.on("message", (channel: string, rawNotification: string) => {
    for (const [environmentId, subscription] of subscriptions) {
      if (channel !== getEnvironmentRunsChannel(environmentId)) {
        continue;
      }

      const notification = parseRunEventNotification(rawNotification);

      if (!notification) {
        return;
      }

      for (const listener of subscription.listeners) {
        listener(notification);
      }

      return;
    }
  });

  async function subscribe(environmentId: string, listener: EnvironmentRunsNotificationListener) {
    let subscription = subscriptions.get(environmentId);

    if (!subscription) {
      subscription = {
        listeners: new Set(),
        subscribed: false,
        subscribePromise: null,
      };

      subscriptions.set(environmentId, subscription);
    }

    subscription.listeners.add(listener);

    if (!subscription.subscribed && !subscription.subscribePromise) {
      subscription.subscribePromise = redis
        .subscribe(getEnvironmentRunsChannel(environmentId))
        .then(() => {
          subscription!.subscribed = true;
          return undefined;
        })
        .catch((error: unknown) => {
          subscriptions.delete(environmentId);
          throw error;
        })
        .finally(() => {
          subscription!.subscribePromise = null;
        });
    }

    await subscription.subscribePromise;

    let unsubscribe = false;

    return async () => {
      if (unsubscribe) {
        return;
      }

      unsubscribe = true;

      const currentSubscription = subscriptions.get(environmentId);

      if (!currentSubscription) {
        return;
      }

      currentSubscription.listeners.delete(listener);

      if (currentSubscription.listeners.size > 0) {
        return;
      }

      subscriptions.delete(environmentId);

      if (currentSubscription.subscribed) {
        await redis.unsubscribe(getEnvironmentRunsChannel(environmentId));
      }
    };
  }

  return {
    subscribe,
  };
}
