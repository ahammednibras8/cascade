import { prisma } from "@cascade/database";
import { TASK_RUN_CANCELLATION_POLL_INTERVAL_MS } from "./config.js";

export class TaskRunCanceledError extends Error {
  readonly code = "RUN_CANCELED";

  constructor(readonly taskRunId: string) {
    super(`Task run ${taskRunId} was canceled`);
    this.name = "TaskRunCanceledError";
  }
}

export async function isTaskRunCanceled(taskRunId: string) {
  const taskRun = await prisma.taskRun.findUnique({
    where: {
      id: taskRunId,
    },
    select: {
      status: true,
    },
  });

  return taskRun?.status === "CANCELED";
}

export async function startTaskRunCancellationWatcher(input: {
  taskRunId: string;
  abortController: AbortController;
}) {
  let stopped = false;
  let checking = false;

  const checkForCancellation = async () => {
    if (stopped || checking || input.abortController.signal.aborted) {
      return;
    }

    checking = true;

    try {
      if (await isTaskRunCanceled(input.taskRunId)) {
        input.abortController.abort(new TaskRunCanceledError(input.taskRunId));
      }
    } catch (error) {
      process.stderr.write(
        `Could not check cancellation for task run ${input.taskRunId}: ${error instanceof Error ? error.stack : String(error)}\n`,
      );
    } finally {
      checking = false;
    }
  };

  await checkForCancellation();

  if (input.abortController.signal.aborted) {
    return () => {};
  }

  const interval = setInterval(() => {
    void checkForCancellation();
  }, TASK_RUN_CANCELLATION_POLL_INTERVAL_MS);

  interval.unref();

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
