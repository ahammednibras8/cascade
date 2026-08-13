import { describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

type Unsubscribe = () => Promise<void>;
type EnvironmentRunsListener = () => void;
type Subscribe = (environmentId: string, listener: EnvironmentRunsListener) => Promise<Unsubscribe>;

const productionSubscribe = vi.hoisted(() => vi.fn<Subscribe>());

vi.mock("../../src/realtime/environment-runs-notifications.js", () => ({
  environmentRunsNotificationSubscriber: {
    subscribe: productionSubscribe,
  },
}));

const { createEnvironmentRunsStream } =
  await import("../../src/realtime/environment-runs-stream.js");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "11111111-1111-4111-8111-111111111111",
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

function createRequest() {
  const closeListeners: Array<() => void> = [];

  return {
    on(event: string, listener: () => void) {
      if (event === "close") {
        closeListeners.push(listener);
      }

      return this;
    },
    close() {
      for (const listener of closeListeners) {
        listener();
      }
    },
  };
}

function createResponse() {
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    writes: [] as string[],
    set(headers: Record<string, string>) {
      Object.assign(response.headers, headers);
      return response;
    },
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    write: vi.fn<(value: string) => void>((value) => {
      response.writes.push(value);
    }),
    flushHeaders: vi.fn<() => void>(),
  };

  return response;
}

describe("environment runs stream", () => {
  it("sends an initial update, then sends Redis-triggered updates", async () => {
    let listener: (() => void) | undefined;

    const unsubscribe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const subscribe = vi.fn<Subscribe>(async (_environmentId, nextListener) => {
      listener = nextListener;
      return unsubscribe;
    });

    const streamEnvironmentRuns = createEnvironmentRunsStream({
      subscribe,
    } as never);

    const request = createRequest();
    const response = createResponse();

    await streamEnvironmentRuns({
      request: request as never,
      response: response as never,
      auth,
    });

    expect(subscribe).toHaveBeenCalledWith(auth.environmentId, expect.any(Function));
    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("text/event-stream");
    expect(response.writes).toContain("event: runs-changed\ndata: {}\n\n");

    listener?.();

    expect(response.write).toHaveBeenCalledTimes(2);
    expect(response.writes).toEqual([
      "event: runs-changed\ndata: {}\n\n",
      "event: runs-changed\ndata: {}\n\n",
    ]);

    request.close();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("unsubscribes if the browser closes before Redis subscription finishes", async () => {
    let finishSubscribe: (() => void) | undefined;

    const unsubscribe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const subscribe = vi.fn<Subscribe>(
      () =>
        new Promise<() => Promise<void>>((resolve) => {
          finishSubscribe = () => {
            resolve(unsubscribe);
          };
        }),
    );

    const streamEnvironmentRuns = createEnvironmentRunsStream({
      subscribe,
    } as never);

    const request = createRequest();
    const response = createResponse();

    const result = streamEnvironmentRuns({
      request: request as never,
      response: response as never,
      auth,
    });

    request.close();
    finishSubscribe?.();

    await result;

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(response.write).not.toHaveBeenCalled();
  });
});
