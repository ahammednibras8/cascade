import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { packageName } from "@cascade/core";
import { WORKER_HEALTH_HOST, WORKER_HEALTH_PORT } from "../config.js";
import { checkWorkerReadiness, stopWorkerReadinessChecks } from "./readiness.js";
import type { WorkerHealthState } from "./state.js";

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });

  response.end(JSON.stringify(body));
}

async function handleHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
  healthState: WorkerHealthState,
) {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  if (request.method !== "GET") {
    writeJson(response, 404, {
      error: {
        code: "NOT_FOUND",
        message: "Not found",
      },
    });
    return;
  }

  if (pathname === "/livez") {
    const ok = !healthState.isShuttingDown();

    writeJson(response, ok ? 200 : 503, {
      ok,
      service: packageName,
    });
    return;
  }

  if (pathname === "/readyz" || pathname === "/healthz") {
    const readiness = await checkWorkerReadiness(healthState);

    writeJson(response, readiness.ok ? 200 : 503, {
      ok: readiness.ok,
      service: packageName,
      worker: readiness.worker,
      dependencies: readiness.dependencies,
    });
    return;
  }

  writeJson(response, 404, {
    error: {
      code: "NOT_FOUND",
      message: "Not found",
    },
  });
}

export async function startWorkerHealthServer(healthState: WorkerHealthState): Promise<Server> {
  const server = createServer((request, response) => {
    void handleHealthRequest(request, response, healthState);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);

    server.listen(WORKER_HEALTH_PORT, WORKER_HEALTH_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  process.stdout.write(
    `Worker health endpoint listening on http://${WORKER_HEALTH_HOST}:${WORKER_HEALTH_PORT}\n`,
  );

  return server;
}

export async function stopWorkerHealthServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  stopWorkerReadinessChecks();
}
