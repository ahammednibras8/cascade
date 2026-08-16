import { describe, expect, it, vi } from "vitest";
import type { ApiAuthContext } from "../../src/auth/api-key.js";

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const LAST_EVENT_ID = "33333333-3333-4333-8333-333333333333";
const FIRST_EVENT_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_EVENT_ID = "55555555-5555-4555-8555-555555555555";
const LIVE_EVENT_ID = "66666666-6666-4666-8666-666666666666";

type RunEventNotificationListener = (notification: { eventId: string }) => void;
type Unsubscribe = () => Promise<void>;
type Subscribe = (runId: string, listener: RunEventNotificationListener) => Promise<Unsubscribe>;

type ListTaskRunEvents = (input: {
  auth: ApiAuthContext;
  runId: string | undefined;
  afterEventId?: string;
}) => Promise<
  | {
      ok: true;
      status: 200;
      events: Array<ReturnType<typeof createEvent>>;
      nextCursor: string | null;
      hasMore: boolean;
    }
  | {
      ok: false;
      status: 400 | 404;
      error: {
        code: string;
        message: string;
      };
    }
>;

const productionListTaskRunEvents = vi.hoisted(() => vi.fn<ListTaskRunEvents>());
const productionSubscribe = vi.hoisted(() => vi.fn<Subscribe>());

vi.mock("../../src/features/task-runs/list-task-run-events.js", () => ({
  listTaskRunEvents: productionListTaskRunEvents,
}));

vi.mock("../../src/realtime/run-event-notifications.js", () => ({
  runEventNotificationSubscriber: {
    subscribe: productionSubscribe,
  },
}));

const { createTaskRunEventStream } = await import("../../src/realtime/run-event-stream.js");

const auth = {
  apiKeyId: "api-key-1",
  environmentId: "environment-1",
  projectId: "project-1",
  scopes: [],
} satisfies ApiAuthContext;

function createRequest(lastEventId?: string) {
  const closeListeners: Array<() => void> = [];

  return {
    get(name: string) {
      return name === "Last-Event-ID" ? lastEventId : undefined;
    },
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

function createEvent(id: string) {
  return {
    id,
    taskAttemptId: null,
    type: "task.log",
    level: "INFO",
    message: "Task log",
    data: null,
    traceId: null,
    spanId: null,
    parentSpanId: null,
    createdAt: "2026-08-12T00:00:00.000Z",
  };
}

describe("task run event stream", () => {
  it("replays missed events, then streams Redis notifications", async () => {
    let notificationListener: ((notification: { eventId: string }) => void) | undefined;

    const listTaskRunEvents = vi
      .fn<ListTaskRunEvents>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        events: [createEvent(FIRST_EVENT_ID)],
        nextCursor: FIRST_EVENT_ID,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        events: [createEvent(SECOND_EVENT_ID)],
        nextCursor: SECOND_EVENT_ID,
        hasMore: false,
      });

    const unsubscribe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const subscribe = vi.fn<Subscribe>(async (_runId, listener) => {
      notificationListener = listener;
      return unsubscribe;
    });

    const streamTaskRunEvents = createTaskRunEventStream({
      listTaskRunEvents,
      subscribe,
    } as never);

    const request = createRequest(LAST_EVENT_ID);
    const response = createResponse();

    await expect(
      streamTaskRunEvents({
        request: request as never,
        response: response as never,
        auth,
        runId: RUN_ID,
      }),
    ).resolves.toEqual({
      ok: true,
    });

    expect(listTaskRunEvents).toHaveBeenNthCalledWith(1, {
      auth,
      runId: RUN_ID,
      afterEventId: LAST_EVENT_ID,
    });

    expect(listTaskRunEvents).toHaveBeenNthCalledWith(2, {
      auth,
      runId: RUN_ID,
      afterEventId: FIRST_EVENT_ID,
    });

    expect(subscribe).toHaveBeenCalledWith(RUN_ID, expect.any(Function));
    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("text/event-stream");

    expect(response.writes).toContain(
      `id: ${FIRST_EVENT_ID}\nevent: run-event\ndata: {"eventId":"${FIRST_EVENT_ID}"}\n\n`,
    );
    expect(response.writes).toContain(
      `id: ${SECOND_EVENT_ID}\nevent: run-event\ndata: {"eventId":"${SECOND_EVENT_ID}"}\n\n`,
    );

    notificationListener?.({
      eventId: LIVE_EVENT_ID,
    });

    expect(response.writes).toContain(
      `id: ${LIVE_EVENT_ID}\nevent: run-event\ndata: {"eventId":"${LIVE_EVENT_ID}"}\n\n`,
    );

    request.close();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not subscribe when the run is invalid or inaccessible", async () => {
    const listTaskRunEvents = vi.fn<ListTaskRunEvents>().mockResolvedValue({
      ok: false,
      status: 404,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Task run was not found in this environment",
      },
    });

    const subscribe = vi.fn<Subscribe>();

    const streamTaskRunEvents = createTaskRunEventStream({
      listTaskRunEvents,
      subscribe,
    } as never);

    const result = await streamTaskRunEvents({
      request: createRequest() as never,
      response: createResponse() as never,
      auth,
      runId: RUN_ID,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Task run was not found in this environment",
      },
    });

    expect(subscribe).not.toHaveBeenCalled();
  });
});
