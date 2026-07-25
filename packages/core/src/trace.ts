import { randomBytes } from "node:crypto";

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  traceFlags: "01";
  traceparent: string;
};

function randomNonZeroHex(byteLength: number) {
  let bytes = randomBytes(byteLength);

  while (bytes.every((byte) => byte === 0)) {
    bytes = randomBytes(byteLength);
  }

  return bytes.toString("hex");
}

export function createTraceId() {
  return randomNonZeroHex(16);
}

export function createSpanId() {
  return randomNonZeroHex(8);
}

export function toTraceparent(input: { traceId: string; spanId: string; traceFlags?: "01" }) {
  return `00-${input.traceId}-${input.spanId}-${input.traceFlags ?? "01"}`;
}

export function createRootTraceContext(): TraceContext {
  const traceId = createTraceId();
  const spanId = createSpanId();

  return {
    traceId,
    spanId,
    parentSpanId: null,
    traceFlags: "01",
    traceparent: toTraceparent({ traceId, spanId }),
  };
}

export function createChildTraceContext(input: {
  traceId: string;
  parentSpanId: string | null | undefined;
}): TraceContext {
  const spanId = createSpanId();

  return {
    traceId: input.traceId,
    spanId,
    parentSpanId: input.parentSpanId ?? null,
    traceFlags: "01",
    traceparent: toTraceparent({ traceId: input.traceId, spanId }),
  };
}

function isHex(str: string): boolean {
  for (const char of str) {
    const isDigit = char >= "0" && char <= "9";
    const isLowerHex = char >= "a" && char <= "f";

    if (!isDigit && !isLowerHex) {
      return false;
    }
  }
  return true;
}

function isAllZeros(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== "0") {
      return false;
    }
  }
  return true;
}

export function parseTraceparent(value: string | undefined) {
  if (!value) {
    return null;
  }

  if (value.length !== 55) {
    return null;
  }

  const parts = value.split("-");

  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  if (version !== "00" || traceId?.length !== 32 || spanId?.length !== 16 || flags?.length !== 2) {
    return null;
  }

  if (!isHex(traceId) || !isHex(spanId) || !isHex(flags)) {
    return null;
  }

  if (isAllZeros(traceId) || isAllZeros(spanId)) {
    return null;
  }

  return {
    traceId,
    spanId,
  };
}
