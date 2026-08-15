import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { createDeployment } from "../services/create-deployment.js";
import { getAuthOrRespond } from "./route-auth.js";
import { ApiKeyScope } from "@cascade/database";
import { requireApiKeyScope } from "../auth/api-key.js";

export const deploymentRoutes: ExpressRouter = Router();

deploymentRoutes.post(
  "/deployments",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await createDeployment({
      auth,
      body: request.body,
    });

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
      });
      return;
    }

    response.status(result.status).json({
      deployment: result.deployment,
    });
  }),
);
