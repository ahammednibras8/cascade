/* eslint-disable no-await-in-loop */
import type { Request, Response } from "express";
import type { ApiAuthContext } from "../auth/api-key.js";
import { listTaskRunEvents } from "../features/task-runs/list-task-run-events.js";
import { runEventNotificationSubscriber } from "./run-event-notifications.js";

const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const RECENT_EVENT_ID_LIMIT = 1_000;

type StreamTaskRunEventsInput = {
  request: Pick<Request, "get" | "on">;
  response: Pick<Response, "set" | "status" | "write"> & {
    flushHeaders?: () => void;
  };
  auth: ApiAuthContext;
  runId: string | undefined;
};

type StreamTaskRunEventsResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 400 | 404;
      error: {
        code: string;
        message: string;
      };
    };

type StreamDependencies = {
  listTaskRunEvents: typeof listTaskRunEvents;
  subscribe: typeof runEventNotificationSubscriber.subscribe;
};

function writeRunEvent(response: StreamTaskRunEventsInput["response"], eventId: string) {
  response.write(`id: ${eventId}\nevent: run-event\ndata: ${JSON.stringify({ eventId })}\n\n`);
}

function rememberRecentEvent(
  recentEventIds: Set<string>,
  recentEventOrder: string[],
  eventId: string,
) {
  if (recentEventIds.has(eventId)) {
    return false;
  }

  recentEventIds.add(eventId);
  recentEventOrder.push(eventId);

  if (recentEventOrder.length > RECENT_EVENT_ID_LIMIT) {
    const oldestEventId = recentEventOrder.shift();

    if (oldestEventId) {
      recentEventIds.delete(oldestEventId);
    }
  }

  return true;
}

function getLastEventId(request: StreamTaskRunEventsInput["request"]) {
  const value = request.get("Last-Event-ID")?.trim();

  return value || undefined;
}

function createStreamState() {
  return {
    closed: false,
    ready: false,
    pendingNotificationIds: [] as string[],
    recentEventIds: new Set<string>(),
    recentEventOrder: [] as string[],
    unsubscribe: undefined as (() => Promise<void>) | undefined,
  };
}

function createEventSender(input: {
  response: StreamTaskRunEventsInput["response"];
  state: ReturnType<typeof createStreamState>;
}) {
  return (eventId: string) => {
    if (
      input.state.closed ||
      !rememberRecentEvent(input.state.recentEventIds, input.state.recentEventOrder, eventId)
    ) {
      return;
    }

    writeRunEvent(input.response, eventId);
  };
}

function writeStreamHeaders(response: StreamTaskRunEventsInput["response"]) {
  response.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  response.status(200);
  response.flushHeaders?.();
  response.write(": connected\n\n");
}

function startHeartbeat(
  input: StreamTaskRunEventsInput,
  state: ReturnType<typeof createStreamState>,
) {
  const heartbeat = setInterval(() => {
    if (!state.closed) {
      input.response.write(": heartbeat\n\n");
    }
  }, SSE_HEARTBEAT_INTERVAL_MS);

  heartbeat.unref();
  input.request.on("close", () => {
    clearInterval(heartbeat);
  });
}

async function collectReplayEventIds(input: {
  dependencies: StreamDependencies;
  auth: ApiAuthContext;
  runId: string;
  initialPage: Awaited<ReturnType<typeof listTaskRunEvents>> & { ok: true };
  lastEventId: string | undefined;
  unsubscribe: () => Promise<void>;
}): Promise<{ ok: true; eventIds: string[] } | Exclude<StreamTaskRunEventsResult, { ok: true }>> {
  const eventIds = input.initialPage.events.map((event) => event.id);
  let cursor = input.initialPage.nextCursor ?? input.lastEventId;
  let hasMore = input.initialPage.hasMore;

  do {
    const page = await input.dependencies.listTaskRunEvents({
      auth: input.auth,
      runId: input.runId,
      ...(cursor ? { afterEventId: cursor } : {}),
    });

    if (!page.ok) {
      await input.unsubscribe();

      return page;
    }

    eventIds.push(...page.events.map((event) => event.id));
    cursor = page.nextCursor ?? cursor;
    hasMore = page.hasMore;
  } while (hasMore);

  return { ok: true, eventIds };
}

function registerCloseHandler(input: {
  request: StreamTaskRunEventsInput["request"];
  state: ReturnType<typeof createStreamState>;
}) {
  input.request.on("close", () => {
    input.state.closed = true;

    void input.state.unsubscribe?.().catch((error: unknown) => {
      process.stderr.write(
        `Failed to unsubscribe run event stream: ${error instanceof Error ? error.stack : String(error)}\n`,
      );
    });
  });
}

function flushBufferedEvents(input: {
  replayedEventIds: string[];
  state: ReturnType<typeof createStreamState>;
  sendEvent: (eventId: string) => void;
}) {
  for (const eventId of input.replayedEventIds) {
    input.sendEvent(eventId);
  }

  input.state.ready = true;

  for (const eventId of input.state.pendingNotificationIds) {
    input.sendEvent(eventId);
  }
}

export function createTaskRunEventStream(dependencies: StreamDependencies) {
  return async function streamTaskRunEvents(
    input: StreamTaskRunEventsInput,
  ): Promise<StreamTaskRunEventsResult> {
    const lastEventId = getLastEventId(input.request);

    // First read validates both the run ID and environment ownership
    const initialPage = await dependencies.listTaskRunEvents({
      auth: input.auth,
      runId: input.runId,
      ...(lastEventId ? { afterEventId: lastEventId } : {}),
    });

    if (!initialPage.ok) {
      return initialPage;
    }

    const runId = input.runId;

    // `listTaskRunEvents` already validated runId above
    if (!runId) {
      return {
        ok: false,
        status: 400,
        error: {
          code: "INVALID_RUN_ID",
          message: "runId must be a valid UUID",
        },
      };
    }

    const state = createStreamState();
    const sendEvent = createEventSender({ response: input.response, state });

    const handleNotification = ({ eventId }: { eventId: string }) => {
      if (state.closed) {
        return;
      }

      if (!state.ready) {
        state.pendingNotificationIds.push(eventId);
        return;
      }

      sendEvent(eventId);
    };

    registerCloseHandler({ request: input.request, state });

    try {
      // Subscribe before the second DB read, That closes the race where an event is created after the initial read but before Redis subscription begins
      state.unsubscribe = await dependencies.subscribe(runId, handleNotification);

      if (state.closed) {
        await state.unsubscribe();
        return {
          ok: true,
        };
      }

      // Read once after subscribing, even if the first page had no more results
      // This captures an event created between the first read and subscription
      const replay = await collectReplayEventIds({
        dependencies,
        auth: input.auth,
        runId,
        initialPage,
        lastEventId,
        unsubscribe: state.unsubscribe,
      });

      if (!replay.ok) {
        return replay;
      }

      writeStreamHeaders(input.response);
      flushBufferedEvents({
        replayedEventIds: replay.eventIds,
        state,
        sendEvent,
      });
      startHeartbeat(input, state);

      return {
        ok: true,
      };
    } catch (error) {
      await state.unsubscribe?.().catch(() => {});
      throw error;
    }
  };
}

export const streamTaskRunEvents = createTaskRunEventStream({
  listTaskRunEvents,
  subscribe: runEventNotificationSubscriber.subscribe,
});
