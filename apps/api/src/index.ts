import express, { type ErrorRequestHandler } from "express";
import { packageName } from "@cascade/core";
import { requireApiKey } from "./auth/api-key.js";
import { tasksRouter } from "./routes/tasks.js";

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

app.listen(port, () => {
  process.stdout.write(`API listening on http://localhost:${port}\n`);
});
