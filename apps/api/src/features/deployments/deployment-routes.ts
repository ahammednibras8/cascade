import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "../../http/async-handler.js";
import { createDeployment } from "./create-deployment.js";
import { getAuthOrRespond } from "../../routes/route-auth.js";
import { ApiKeyScope } from "@cascade/database";
import { requireApiKeyScope } from "../../auth/api-key.js";
import { getSingleParam } from "../../lib/route-params.js";
import { getDeployment } from "./get-deployment.js";
import { listDeployments } from "./list-deployments.js";
import { deactivateDeployment } from "./deactivate-deployment.js";
import { rollbackDeployment } from "./rollback-deployment.js";

export const deploymentRoutes: ExpressRouter = Router();

deploymentRoutes.get(
  "/deployments",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await listDeployments({ auth });

    response.status(result.status).json({
      deployments: result.deployments,
    });
  }),
);

deploymentRoutes.get(
  "/deployments/:deploymentId",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await getDeployment({
      auth,
      deploymentId: getSingleParam(request.params.deploymentId),
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

deploymentRoutes.post(
  "/deployments/:deploymentId/deactivate",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await deactivateDeployment({
      auth,
      deploymentId: getSingleParam(request.params.deploymentId),
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

deploymentRoutes.post(
  "/deployments/:deploymentId/rollback",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  asyncHandler(async (request, response) => {
    const auth = getAuthOrRespond(request, response);

    if (!auth) {
      return;
    }

    const result = await rollbackDeployment({
      auth,
      deploymentId: getSingleParam(request.params.deploymentId),
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
