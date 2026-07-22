import { Prisma } from "@cascade/database";

export function getPayload(body: unknown): Prisma.InputJsonValue | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return body as Prisma.InputJsonValue;
  }

  if (!("payload" in body)) {
    return undefined;
  }

  const payload = (body as { payload?: unknown }).payload;

  if (payload === undefined || payload === null) {
    return undefined;
  }

  return payload as Prisma.InputJsonValue;
}
