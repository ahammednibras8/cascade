import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnvironmentRunsNotificationSubscriber } from "../../src/realtime/environment-runs-notification-subscriber.js";

const ENVIRONMENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ENVIRONMENT_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

type MessageListener = (channel: string, message: string) => void;
type RunsListener = (notification: { eventId: string }) => void;

function createRedisStub() {
  let messageListener: MessageListener | undefined;

  const redis = {
    on: vi.fn<(event: string, listener: MessageListener) => void>((event, listener) => {
      if (event === "message") {
        messageListener = listener;
      }
    }),
    subscribe: vi.fn<() => Promise<number>>().mockResolvedValue(1),
    unsubscribe: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    emitMessage(channel: string, message: string) {
      messageListener?.(channel, message);
    },
  };

  return redis;
}

describe("environment runs notification subscriber", () => {
  let redis: ReturnType<typeof createRedisStub>;

  beforeEach(() => {
    redis = createRedisStub();
  });

  it("shares one Redis subscription between listeners in the same environment", async () => {
    const subscriber = createEnvironmentRunsNotificationSubscriber(redis as never);
    const firstListener = vi.fn<RunsListener>();
    const secondListener = vi.fn<RunsListener>();

    const unsubscribeFirst = await subscriber.subscribe(ENVIRONMENT_ID, firstListener);
    const unsubscribeSecond = await subscriber.subscribe(ENVIRONMENT_ID, secondListener);

    expect(redis.subscribe).toHaveBeenCalledOnce();
    expect(redis.subscribe).toHaveBeenCalledWith(
      "cascade:realtime:environment-runs:11111111-1111-4111-8111-111111111111",
    );

    redis.emitMessage(
      "cascade:realtime:environment-runs:11111111-1111-4111-8111-111111111111",
      '{"eventId":"33333333-3333-4333-8333-333333333333"}',
    );

    expect(firstListener).toHaveBeenCalledWith({
      eventId: EVENT_ID,
    });
    expect(secondListener).toHaveBeenCalledWith({
      eventId: EVENT_ID,
    });

    await unsubscribeFirst();
    expect(redis.unsubscribe).not.toHaveBeenCalled();

    await unsubscribeSecond();

    expect(redis.unsubscribe).toHaveBeenCalledWith(
      "cascade:realtime:environment-runs:11111111-1111-4111-8111-111111111111",
    );
  });

  it("ignores invalid messages and other environments", async () => {
    const subscriber = createEnvironmentRunsNotificationSubscriber(redis as never);
    const listener = vi.fn<RunsListener>();

    await subscriber.subscribe(ENVIRONMENT_ID, listener);

    redis.emitMessage(
      "cascade:realtime:environment-runs:11111111-1111-4111-8111-111111111111",
      "not-json",
    );

    redis.emitMessage(
      `cascade:realtime:environment-runs:${OTHER_ENVIRONMENT_ID}`,
      '{"eventId":"33333333-3333-4333-8333-333333333333"}',
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes only once", async () => {
    const subscriber = createEnvironmentRunsNotificationSubscriber(redis as never);
    const unsubscribe = await subscriber.subscribe(ENVIRONMENT_ID, vi.fn<RunsListener>());

    await unsubscribe();
    await unsubscribe();

    expect(redis.unsubscribe).toHaveBeenCalledOnce();
  });
});
