import {
  createChildTraceContext,
  createRootTraceContext,
  parseTraceparent,
  toTraceparent,
  type TraceContext,
} from "@cascade/core";
import type { TriggeredTaskRun } from "./types.js";

export function getTriggerTrace(input: {
  trace: TraceContext | undefined;
  traceparent: string | undefined;
}) {
  if (input.trace) {
    return input.trace;
  }

  const parentTrace = parseTraceparent(input.traceparent);

  return parentTrace
    ? createChildTraceContext({
        traceId: parentTrace.traceId,
        parentSpanId: parentTrace.spanId,
      })
    : createRootTraceContext();
}

export function getTaskRunTraceparent(input: {
  taskRun: TriggeredTaskRun;
  triggerTrace: TraceContext;
}) {
  return toTraceparent({
    traceId: input.taskRun.traceId ?? input.triggerTrace.traceId,
    spanId: input.taskRun.triggerSpanId ?? input.triggerTrace.spanId,
  });
}
