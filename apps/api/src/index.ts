import express from "express";
import { packageName } from "@cascade/core";
import { requireApiKey } from "./auth/api-key.js";
import { tasksRouter } from "./routes/tasks.js";
import { taskRunQueueRedis } from "./queue/task-runs.js";
import { prisma } from "@cascade/database";
import { shutdownTelemetry } from "@cascade/telemetry";
import { errorHandler } from "./http/error-handler.js";
import { jsonBodyParser, requireJsonContentType } from "./http/json-body.js";
import { securityHeaders } from "./http/security-headers.js";
import { corsPolicy } from "./http/cors-policy.js";
import { apiRateLimit } from "./http/rate-limit.js";
import { asyncHandler } from "./http/async-handler.js";
import { checkApiReadiness } from "./health/api-readiness.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);
let shuttingDown = false;

app.disable("x-powered-by");
app.use(securityHeaders());
app.use(corsPolicy());
app.use(requireJsonContentType());
app.use(jsonBodyParser());

const readinessHandler = asyncHandler(async (_request, response) => {
  const readiness = await checkApiReadiness();

  response
    .set("Cache-Control", "no-store")
    .status(readiness.ok ? 200 : 503)
    .json({
      ok: readiness.ok,
      service: packageName,
      dependencies: readiness.dependencies,
    });
});

app.get("/livez", (_request, response) => {
  response
    .set("Cache-Control", "no-store")
    .status(shuttingDown ? 503 : 200)
    .json({
      ok: !shuttingDown,
      service: packageName,
    });
});

app.get("/readyz", readinessHandler);
app.get("healthz", readinessHandler);

app.get("/me", (request, response) => {
  response.json({
    auth: request.auth,
  });
});

app.use("/api", requireApiKey(), apiRateLimit(), tasksRouter);

app.use(errorHandler);

const server = app.listen(port, () => {
  process.stdout.write(`API listening on http://localhost:${port}\n`);
});

async function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  process.stdout.write(`Received ${signal}; shutting down API\n`);

  const forceExitTimer = setTimeout(() => {
    process.stderr.write("API shutdown timed out\n");
    process.exit(1);
  }, 25_000);

  forceExitTimer.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await taskRunQueueRedis.quit();
    await prisma.$disconnect();
    await shutdownTelemetry();

    process.exit(0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  } finally {
    clearTimeout(forceExitTimer);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
