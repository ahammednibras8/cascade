import express, { type ErrorRequestHandler } from "express";
import { packageName } from "@cascade/core";
import { requireApiKey } from "./auth/api-key.js";
import { tasksRouter } from "./routes/tasks.js";
import { taskRunQueueRedis } from "./queue/task-runs.js";
import { prisma } from "@cascade/database";
import { shutdownTelemetry } from "@cascade/telemetry";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.disable("x-powered-by");
app.use(express.json());

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    service: packageName,
  });
});

app.get("/me", (request, response) => {
  response.json({
    auth: request.auth,
  });
});

app.use("/api", requireApiKey(), tasksRouter);

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    },
  });
};

app.use(errorHandler);

const server = app.listen(port, () => {
  process.stdout.write(`API listening on http://localhost:${port}\n`);
});

let shuttingDown = false;

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
