import { Router, type Router as ExpressRouter } from "express";
import { deploymentRoutes } from "../features/deployments/deployment-routes.js";
import { taskRoutes } from "../features/tasks/task-routes.js";
import { taskRunRoutes } from "../features/task-runs/task-run-routes.js";
import { apikeyRoutes } from "../features/api-keys/api-key-routes.js";

export const apiRouter: ExpressRouter = Router();

apiRouter.use(apikeyRoutes);
apiRouter.use(deploymentRoutes);
apiRouter.use(taskRoutes);
apiRouter.use(taskRunRoutes);
