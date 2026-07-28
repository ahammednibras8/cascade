import { Prisma } from "@cascade/database";

export function serializeTaskRunError(error: unknown): Prisma.InputJsonValue {
  if (error instanceof Error) {
    const data: Record<string, Prisma.InputJsonValue> = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) {
      data.stack = error.stack;
    }

    const errorWithCode = error as { code?: unknown; timeoutMs?: unknown };

    if (typeof errorWithCode.code === "string") {
      data.code = errorWithCode.code;
    }

    if (typeof errorWithCode.timeoutMs === "number") {
      data.timeoutMs = errorWithCode.timeoutMs;
    }

    return data;
  }

  return {
    message: String(error),
  };
}
