import {
  refreshQueueConcurrencyLease,
  type QueueConcurrencyLease,
} from "../queue/concurrency-limits.js";

export function startQueueConcurrencyLeaseHeartbeat(lease: QueueConcurrencyLease) {
  const interval = setInterval(
    () => {
      void refreshQueueConcurrencyLease(lease).catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      });
    },
    Math.floor(lease.ttlMs / 3),
  );

  interval.unref();

  return () => clearInterval(interval);
}
