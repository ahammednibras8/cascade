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

    let closed = false;
    let ready = false;
    let unsubscribe: (() => Promise<void>) | undefined;

    const pendingNotificationIds: string[] = [];
    const recentEventIds = new Set<string>();
    const recentEventOrder: string[] = [];

    const sendEvent = (eventId: string) => {
      if (closed || !rememberRecentEvent(recentEventIds, recentEventOrder, eventId)) {
        return;
      }

      writeRunEvent(input.response, eventId);
    };

    const handleNotification = ({ eventId }: { eventId: string }) => {
      if (closed) {
        return;
      }

      if (!ready) {
        pendingNotificationIds.push(eventId);
        return;
      }

      sendEvent(eventId);
    };

    input.request.on("close", () => {
      closed = true;

      void unsubscribe?.().catch((error: unknown) => {
        process.stderr.write(
          `Failed to unsubscribe run event stream: ${error instanceof Error ? error.stack : String(error)}\n`,
        );
      });
    });

    try {
      // Subscribe before the second DB read, That closes the race where an event is created after the initial read but before Redis subscription begins
      unsubscribe = await dependencies.subscribe(runId, handleNotification);

      if (closed) {
        await unsubscribe();
        return {
          ok: true,
        };
      }

      const replayedEventIds = initialPage.events.map((event) => event.id);
      let cursor = initialPage.nextCursor ?? lastEventId;
      let hasMore = initialPage.hasMore;

      // Read once after subscribing, even if the first page had no more results
      // This captures an event created between the first read and subscription
      do {
        const page = await dependencies.listTaskRunEvents({
          auth: input.auth,
          runId,
          ...(cursor ? { afterEventId: cursor } : {}),
        });

        if (!page.ok) {
          await unsubscribe();

          return page;
        }

        replayedEventIds.push(...page.events.map((event) => event.id));
        cursor = page.nextCursor ?? cursor;
        hasMore = page.hasMore;
      } while (hasMore);

      input.response.set({
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      });
      input.response.status(200);
      input.response.flushHeaders?.();
      input.response.write(": connected\n\n");

      for (const eventId of replayedEventIds) {
        sendEvent(eventId);
      }

      ready = true;

      for (const eventId of pendingNotificationIds) {
        sendEvent(eventId);
      }

      const heartbeat = setInterval(() => {
        if (!closed) {
          input.response.write(": heartbeat\n\n");
        }
      }, SSE_HEARTBEAT_INTERVAL_MS);

      heartbeat.unref();

      input.request.on("close", () => {
        clearInterval(heartbeat);
      });

      return {
        ok: true,
      };
    } catch (error) {
      await unsubscribe?.().catch(() => {});
      throw error;
    }
  };
}

export const streamTaskRunEvents = createTaskRunEventStream({
  listTaskRunEvents,
  subscribe: runEventNotificationSubscriber.subscribe,
});
