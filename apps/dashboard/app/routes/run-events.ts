import type { Route } from "./+types/run-events";

const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

function noop() {}

function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function encodeSseComment(comment: string) {
  return `: ${comment}\n\n`;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { prisma } = await import("@cascade/database");

  const runId = params.runId;

  const existingRun = await prisma.taskRun.findUnique({
    where: {
      id: runId,
    },
    select: {
      id: true,
    },
  });

  if (!existingRun) {
    throw new Response("Run not found", {
      status: 404,
    });
  }

  const encoder = new TextEncoder();

  let cleanup = noop;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      let lastSignature: string | undefined;

      async function readRunSignature() {
        const [run, attemptsCount, eventsCount] = await prisma.$transaction([
          prisma.taskRun.findUnique({
            where: {
              id: runId,
            },
            select: {
              id: true,
              status: true,
              updatedAt: true,
              lastHeartbeatAt: true,
              completedAt: true,
            },
          }),
          prisma.taskAttempt.count({
            where: {
              taskRunId: runId,
            },
          }),
          prisma.taskEvent.count({
            where: {
              taskRunId: runId,
            },
          }),
        ]);

        if (!run) {
          return null;
        }

        return {
          id: run.id,
          status: run.status,
          updatedAt: run.updatedAt.toISOString(),
          lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
          completedAt: run.completedAt?.toISOString() ?? null,
          attemptsCount,
          eventsCount,
        };
      }

      function send(event: string, data: unknown) {
        if (isClosed) {
          return;
        }

        controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
      }

      async function poll() {
        try {
          const snapshot = await readRunSignature();

          if (!snapshot) {
            send("run.deleted", {
              id: runId,
            });

            cleanup();
            controller.close();
            return;
          }

          const signature = JSON.stringify(snapshot);

          if (lastSignature === undefined) {
            lastSignature = signature;

            send("connected", {
              id: runId,
              status: snapshot.status,
            });

            return;
          }

          if (signature !== lastSignature) {
            lastSignature = signature;
            send("run.updated", snapshot);
          }
        } catch {
          send("stream.error", {
            message: "Failed to poll run updates",
          });
        }
      }

      const pollInterval = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);

      const heartbeatInterval = setInterval(() => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(encodeSseComment(`heartbeat ${Date.now()}`)));
        }
      }, HEARTBEAT_INTERVAL_MS);

      cleanup = () => {
        if (isClosed) {
          return;
        }

        isClosed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        request.signal.removeEventListener("abort", cleanup);
      };

      request.signal.addEventListener("abort", cleanup);

      void poll();
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
