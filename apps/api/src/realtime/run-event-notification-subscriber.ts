import { getRunEventChannel, parseRunEventNotification } from "@cascade/core";
import type { Redis } from "ioredis";

type RunEventNotificationListener = (notification: { eventId: string }) => void;

type RedisSubscriptionClient = Pick<Redis, "on" | "subscribe" | "unsubscribe">;

type RunSubscription = {
  listeners: Set<RunEventNotificationListener>;
  subscribed: boolean;
  subscribePromise: Promise<void> | null;
};

export function createRunEventNotificationSubscriber(redis: RedisSubscriptionClient) {
  const subscriptions = new Map<string, RunSubscription>();

  redis.on("message", (channel: string, rawNotification: string) => {
    for (const [runId, subscription] of subscriptions) {
      if (channel !== getRunEventChannel(runId)) {
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

  async function subscribe(runId: string, listener: RunEventNotificationListener) {
    let subscription = subscriptions.get(runId);

    if (!subscription) {
      subscription = {
        listeners: new Set(),
        subscribed: false,
        subscribePromise: null,
      };

      subscriptions.set(runId, subscription);
    }

    subscription.listeners.add(listener);

    if (!subscription.subscribed && !subscription.subscribePromise) {
      subscription.subscribePromise = redis
        .subscribe(getRunEventChannel(runId))
        .then(() => {
          subscription!.subscribed = true;
          return undefined;
        })
        .catch((error: unknown) => {
          subscriptions.delete(runId);
          throw error;
        })
        .finally(() => {
          subscription!.subscribePromise = null;
        });
    }

    await subscription.subscribePromise;

    let unsubscribed = false;

    return async () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;

      const currentSubscription = subscriptions.get(runId);

      if (!currentSubscription) {
        return;
      }

      currentSubscription.listeners.delete(listener);

      if (currentSubscription.listeners.size > 0) {
        return;
      }

      subscriptions.delete(runId);

      if (currentSubscription.subscribed) {
        await redis.unsubscribe(getRunEventChannel(runId));
      }
    };
  }

  return {
    subscribe,
  };
}
