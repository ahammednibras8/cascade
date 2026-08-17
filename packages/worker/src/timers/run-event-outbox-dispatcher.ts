import { RUN_EVENT_OUTBOX_DISPATCH_INTERVAL_MS } from "../config.js";
import { dispatchRunEventOutbox } from "../realtime/run-event-outbox-dispatcher.js";

export function startRunEventOutboxDispatcher() {
  let currentDispatch: Promise<void> | undefined;

  function runOutboxDispatch() {
    currentDispatch = (async () => {
      await dispatchRunEventOutbox();
    })().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    });
  }

  runOutboxDispatch();

  const interval = setInterval(runOutboxDispatch, RUN_EVENT_OUTBOX_DISPATCH_INTERVAL_MS);
  interval.unref();

  return async () => {
    clearInterval(interval);
    await currentDispatch;
  };
}
