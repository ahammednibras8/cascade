import { Router, type Router as ExpressRouter } from "express";
import { authenticatedRoute, writeJsonResult } from "../../http/route-result.js";
import { createDeployment } from "./create-deployment.js";
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
  authenticatedRoute(async ({ auth, response }) => {
    const result = await listDeployments({ auth });

    response.status(result.status).json({
      deployments: result.deployments,
    });
  }),
);

deploymentRoutes.get(
  "/deployments/:deploymentId",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await getDeployment({
      auth,
      deploymentId: getSingleParam(request.params.deploymentId),
    });

    writeJsonResult(response, result, ({ deployment }) => ({ deployment }));
  }),
);

deploymentRoutes.post(
  "/deployments/:deploymentId/deactivate",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await deactivateDeployment({
      auth,
      deploymentId: getSingleParam(request.params.deploymentId),
    });

    writeJsonResult(response, result, ({ deployment }) => ({ deployment }));
  }),
);

deploymentRoutes.post(
  "/deployments/:deploymentId/rollback",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await rollbackDeployment({
      auth,
      deploymentId: getSingleParam(request.params.deploymentId),
    });

    writeJsonResult(response, result, ({ deployment }) => ({ deployment }));
  }),
);

deploymentRoutes.post(
  "/deployments",
  requireApiKeyScope(ApiKeyScope.DEPLOYMENTS_WRITE),
  authenticatedRoute(async ({ auth, request, response }) => {
    const result = await createDeployment({
      auth,
      body: request.body,
    });

    writeJsonResult(response, result, ({ deployment }) => ({ deployment }));
  }),
);
