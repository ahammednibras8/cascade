import { prisma } from "@cascade/database";

const HEARTBEAT_INTERVAL_MS = 5_000;

export function startTaskRunHeartbeat(taskRunId: string) {
  const interval = setInterval(() => {
    void prisma.taskRun
      .updateMany({
        where: {
          id: taskRunId,
          status: "EXECUTING",
        },
        data: {
          lastHeartbeatAt: new Date(),
        },
      })
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      });
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();

  return () => {
    clearInterval(interval);
  };
}
