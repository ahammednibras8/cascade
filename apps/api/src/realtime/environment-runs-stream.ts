import type { Request, Response } from "express";
import { environmentRunsNotificationSubscriber } from "./environment-runs-notifications.js";
import type { ApiAuthContext } from "../auth/api-key.js";

const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

type StreamEnvironmentRunsInput = {
  request: Pick<Request, "on">;
  response: Pick<Response, "set" | "status" | "write"> & {
    flushHeaders?: () => void;
  };
  auth: ApiAuthContext;
};

type StreamDependencies = {
  subscribe: typeof environmentRunsNotificationSubscriber.subscribe;
};

function writeRunsChanged(response: StreamEnvironmentRunsInput["response"]) {
  response.write("event: runs-changed\ndata: {}\n\n");
}

export function createEnvironmentRunsStream(dependencies: StreamDependencies) {
  return async function streamEnvironmentRuns(input: StreamEnvironmentRunsInput) {
    let closed = false;
    let ready = false;
    let pendingChange = false;
    let unsubscribe: (() => Promise<void>) | undefined;

    const sendChange = () => {
      if (closed) {
        return;
      }

      if (!ready) {
        pendingChange = true;
        return;
      }

      writeRunsChanged(input.response);
    };

    input.request.on("close", () => {
      closed = true;

      void unsubscribe?.().catch((error: unknown) => {
        process.stderr.write(
          `Failed to unsubscribe environment runs stream: ${
            error instanceof Error ? error.stack : String(error)
          }\n`,
        );
      });
    });

    try {
      unsubscribe = await dependencies.subscribe(input.auth.environmentId, sendChange);

      if (closed) {
        await unsubscribe();
        return;
      }

      input.response.set({
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      });
      input.response.status(200);
      input.response.flushHeaders?.();

      // This forces the dashboard to load the current list after every initial connection and automatic reconnect.
      ready = true;
      writeRunsChanged(input.response);

      if (pendingChange) {
        pendingChange = false;
        writeRunsChanged(input.response);
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
    } catch (error) {
      await unsubscribe?.().catch(() => {});
      throw error;
    }
  };
}

export const streamEnvironmentRuns = createEnvironmentRunsStream({
  subscribe: environmentRunsNotificationSubscriber.subscribe,
});
