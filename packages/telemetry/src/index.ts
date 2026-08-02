import {
  context,
  isSpanContextValid,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
  metrics,
  type Attributes,
  type Context,
  type SpanContext,
  type SpanOptions,
} from "@opentelemetry/api";
import { toTraceparent, type TraceContext } from "@cascade/core";

export { shutdownTelemetry } from "./runtime.js";

const meter = metrics.getMeter("@cascade/telemetry");

const taskRunsTriggered = meter.createCounter("cascade.task_runs.triggered", {
  description: "Number of task runs accepted by Cascade",
  unit: "{task_run}",
});

const taskRunExecutions = meter.createCounter("cascade.task_run.executions", {
  description: "Number of task-run execution attempts completed by outcome",
  unit: "{execution}",
});

const taskRunExecutionDuration = meter.createHistogram("cascade.task_run.execution.duration", {
  description: "Duration of a task-run execution attempt",
  unit: "ms",
});

type TaskRunExecutionOutcome = "completed" | "failed" | "retried";

export function recordTaskRunTriggered() {
  taskRunsTriggered.add(1, {
    "cascade.trigger.source": "api",
  });
}

export function recordTaskRunExecution(input: {
  outcome: TaskRunExecutionOutcome;
  durationMs: number;
}) {
  const attributes = {
    "cascade.task_run.outcome": input.outcome,
  };

  taskRunExecutions.add(1, attributes);
  taskRunExecutionDuration.record(input.durationMs, attributes);
}

type WithActiveSpanInput = {
  name: string;
  attributes?: Attributes;
  kind?: SpanKind;
};

type WithRemoteParentSpanInput = {
  name: string;
  attributes?: Attributes;
  parent: TraceContext;
};

function getTraceFlags(spanContext: SpanContext): "00" | "01" {
  return spanContext.traceFlags & TraceFlags.SAMPLED ? "01" : "00";
}

function toCascadeTraceContext(
  spanContext: SpanContext,
  parentSpanId: string | null,
): TraceContext | null {
  if (!isSpanContextValid(spanContext)) {
    return null;
  }

  const traceFlags = getTraceFlags(spanContext);

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    parentSpanId,
    traceFlags,
    traceparent: toTraceparent({
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags,
    }),
  };
}

async function withSpan<T>(
  input: WithActiveSpanInput,
  parentContext: Context,
  run: (traceContext: TraceContext | null) => Promise<T>,
): Promise<T> {
  const parentSpanContext = trace.getSpan(parentContext)?.spanContext();
  const parentSpanId =
    parentSpanContext && isSpanContextValid(parentSpanContext) ? parentSpanContext.spanId : null;

  const spanOptions: SpanOptions = {
    kind: input.kind ?? SpanKind.INTERNAL,
  };

  if (input.attributes) {
    spanOptions.attributes = input.attributes;
  }

  return trace
    .getTracer("@cascade/telemetry")
    .startActiveSpan(input.name, spanOptions, parentContext, async (span) => {
      try {
        return await run(toCascadeTraceContext(span.spanContext(), parentSpanId));
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
        });
        throw error;
      } finally {
        span.end();
      }
    });
}

export function withActiveSpan<T>(
  input: WithActiveSpanInput,
  run: (traceContext: TraceContext | null) => Promise<T>,
): Promise<T> {
  return withSpan(input, context.active(), run);
}

export function withRemoteParentSpan<T>(
  input: WithRemoteParentSpanInput,
  run: (traceContext: TraceContext | null) => Promise<T>,
): Promise<T> {
  const remoteParentContext = trace.setSpanContext(context.active(), {
    traceId: input.parent.traceId,
    spanId: input.parent.spanId,
    traceFlags: input.parent.traceFlags === "01" ? TraceFlags.SAMPLED : TraceFlags.NONE,
    isRemote: true,
  });

  const spanInput: WithActiveSpanInput = {
    name: input.name,
    kind: SpanKind.CONSUMER,
  };

  if (input.attributes) {
    spanInput.attributes = input.attributes;
  }

  return withSpan(spanInput, remoteParentContext, run);
}
