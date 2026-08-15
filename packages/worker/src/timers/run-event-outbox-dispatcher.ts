import { RUN_EVENT_OUTBOX_DISPATCH_INTERVAL_MS } from "../config.js";
import { dispatchRunEventOutbox } from "../realtime/run-event-outbox-dispatcher.js";

function runOutboxDispatch() {
  void dispatchRunEventOutbox().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  });
}

export function startRunEventOutboxDispatcher() {
  runOutboxDispatch();

  const interval = setInterval(runOutboxDispatch, RUN_EVENT_OUTBOX_DISPATCH_INTERVAL_MS);

  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
