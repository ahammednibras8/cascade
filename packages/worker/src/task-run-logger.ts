import { type JsonValue, type TaskLogLevel } from "@cascade/core";
import { Prisma, prisma } from "@cascade/database";

export function createTaskLogger(input: { taskRunId: string; taskAttemptId: string }) {
  async function log(level: TaskLogLevel, message: string, data?: JsonValue) {
    await prisma.taskEvent.create({
      data: {
        taskRunId: input.taskRunId,
        taskAttemptId: input.taskAttemptId,
        type: "task.log",
        level,
        message,
        ...(data === undefined ? {} : { data: data as Prisma.InputJsonValue }),
      },
    });
  }

  return {
    debug(message: string, data?: JsonValue) {
      return log("DEBUG", message, data);
    },

    info(message: string, data?: JsonValue) {
      return log("INFO", message, data);
    },

    warn(message: string, data?: JsonValue) {
      return log("WARN", message, data);
    },

    error(message: string, data?: JsonValue) {
      return log("ERROR", message, data);
    },
  };
}
