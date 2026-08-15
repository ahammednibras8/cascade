import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | undefined;
let started = false;

function getOtlpUrl(signal: "traces" | "metrics") {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    throw new Error("OTEL_EXPORTER_OTLP_ENDPOINT is required when OTEL_ENABLED=true");
  }

  const baseUrl = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;

  return new URL(`v1/${signal}`, baseUrl).toString();
}

type TelemetryExporterMode = "console" | "otlp";

function getTelemetryExporterMode(): TelemetryExporterMode {
  const mode = process.env.OTEL_EXPORTER_MODE ?? "otlp";

  if (mode === "console" || mode === "otlp") {
    return mode;
  }

  throw new Error("OTEL_EXPORTER_MODE must be console or otlp");
}

export function startTelemetry() {
  if (started || process.env.OTEL_ENABLED !== "true") {
    return;
  }

  started = true;

  const exporterMode = getTelemetryExporterMode();

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": process.env.OTEL_SERVICE_NAME ?? "cascade-unknown",
      "service.version": process.env.CASCADE_VERSION ?? "development",
      "deployment.environment.name": process.env.OTEL_DEPLOYMENT_ENVIRONMENT ?? "development",
    }),
    traceExporter:
      exporterMode === "console"
        ? new ConsoleSpanExporter()
        : new OTLPTraceExporter({
            url: getOtlpUrl("traces"),
          }),
    metricReader: new PeriodicExportingMetricReader({
      exporter:
        exporterMode === "console"
          ? new ConsoleMetricExporter()
          : new OTLPMetricExporter({
              url: getOtlpUrl("metrics"),
            }),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS ?? 1_000),
    }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) =>
          request.url === "/healthz" || request.url === "/readyz" || request.url === "/livez",
      }),
      new ExpressInstrumentation(),
      new IORedisInstrumentation(),
      new UndiciInstrumentation(),
    ],
  });

  sdk.start();
}

export async function shutdownTelemetry() {
  await sdk?.shutdown();
}
