import { type Request } from "express";
import { Prisma } from "@cascade/database";
import { createHash } from "node:crypto";

export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

export function getIdempotencyKey(request: Request) {
  const idempotencyKey = request.get("idempotency-key")?.trim();

  if (!idempotencyKey) {
    return undefined;
  }

  return idempotencyKey;
}

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).toSorted(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`)
    .join(",")}}`;
}

export function hashTriggerRequest(input: {
  taskId: string;
  payload: Prisma.InputJsonValue | undefined;
}) {
  return hashValue(
    stableJsonStringify({
      taskId: input.taskId,
      payload: input.payload ?? null,
    }),
  );
}

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
