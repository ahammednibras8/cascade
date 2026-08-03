import { Router, type Router as ExpressRouter } from "express";
import { deploymentRoutes } from "./deployment-routes.js";
import { taskRoutes } from "./task-routes.js";
import { taskRunRoutes } from "./task-run-routes.js";
import { apikeyRoutes } from "./api-key-routes.js";

export const tasksRouter: ExpressRouter = Router();

tasksRouter.use(apikeyRoutes);
tasksRouter.use(deploymentRoutes);
tasksRouter.use(taskRoutes);
tasksRouter.use(taskRunRoutes);
