import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunEventNotificationSubscriber } from "../../src/realtime/run-event-notification-subscriber.js";

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";

type MessageListener = (channel: string, message: string) => void;
type RunEventListener = (notification: { eventId: string }) => void;

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

function createRunEventListener() {
  return vi.fn<RunEventListener>();
}

describe("run event notification subscriber", () => {
  let redis: ReturnType<typeof createRedisStub>;

  beforeEach(() => {
    redis = createRedisStub();
  });

  it("uses one Redis subscription for multiple listeners of the same run", async () => {
    const subscriber = createRunEventNotificationSubscriber(redis as never);
    const firstListener = createRunEventListener();
    const secondListener = createRunEventListener();

    const unsubscribeFirst = await subscriber.subscribe(RUN_ID, firstListener);
    const unsubscribeSecond = await subscriber.subscribe(RUN_ID, secondListener);

    expect(redis.subscribe).toHaveBeenCalledOnce();
    expect(redis.subscribe).toHaveBeenCalledWith(
      "cascade:realtime:run:22222222-2222-4222-8222-222222222222",
    );

    redis.emitMessage(
      "cascade:realtime:run:22222222-2222-4222-8222-222222222222",
      '{"eventId":"44444444-4444-4444-8444-444444444444"}',
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
      "cascade:realtime:run:22222222-2222-4222-8222-222222222222",
    );
  });

  it("ignores malformed messages and messages for another run", async () => {
    const subscriber = createRunEventNotificationSubscriber(redis as never);
    const listener = createRunEventListener();

    await subscriber.subscribe(RUN_ID, listener);

    redis.emitMessage("cascade:realtime:run:22222222-2222-4222-8222-222222222222", "not-json");

    redis.emitMessage(
      `cascade:realtime:run:${OTHER_RUN_ID}`,
      '{"eventId":"44444444-4444-4444-8444-444444444444"}',
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not unsubscribe twice", async () => {
    const subscriber = createRunEventNotificationSubscriber(redis as never);
    const unsubscribe = await subscriber.subscribe(RUN_ID, createRunEventListener());

    await unsubscribe();
    await unsubscribe();

    expect(redis.unsubscribe).toHaveBeenCalledOnce();
  });
});
