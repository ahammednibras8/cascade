import { describe, expect, it } from "vitest";
import {
  createChildTraceContext,
  createRootTraceContext,
  parseTraceparent,
  toTraceparent,
} from "./trace.js";

describe("trace helpers", () => {
  it("creates valid root trace context", () => {
    const trace = createRootTraceContext();

    expect(trace.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(trace.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(trace.parentSpanId).toBeNull();
    expect(trace.traceFlags).toBe("01");
    expect(trace.traceparent).toBe(`00-${trace.traceId}-${trace.spanId}-01`);
  });

  it("creates child trace context", () => {
    const trace = createChildTraceContext({
      traceId: "11111111111111111111111111111111",
      parentSpanId: "2222222222222222",
    });

    expect(trace.traceId).toBe("11111111111111111111111111111111");
    expect(trace.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(trace.parentSpanId).toBe("2222222222222222");
    expect(trace.traceparent).toBe(`00-${trace.traceId}-${trace.spanId}-01`);
  });

  it("formats traceparent headers", () => {
    expect(
      toTraceparent({
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
      }),
    ).toBe("00-11111111111111111111111111111111-2222222222222222-01");
  });

  it("parses valid traceparent headers", () => {
    expect(parseTraceparent("00-11111111111111111111111111111111-2222222222222222-01")).toEqual({
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
    });
  });

  it("rejects invalid traceparent headers", () => {
    expect(parseTraceparent(undefined)).toBeNull();
    expect(parseTraceparent("not-a-traceparent")).toBeNull();
    expect(parseTraceparent("00-00000000000000000000000000000000-2222222222222222-01")).toBeNull();
    expect(parseTraceparent("00-11111111111111111111111111111111-0000000000000000-01")).toBeNull();
    expect(parseTraceparent("00-11111111111111111111111111111111-2222222222222222-zz")).toBeNull();
  });
});
