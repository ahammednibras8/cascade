import { Router, type Router as ExpressRouter } from "express";
import { deploymentRoutes } from "./deployment-routes.js";
import { taskRoutes } from "./task-routes.js";
import { taskRunRoutes } from "./task-run-routes.js";

export const tasksRouter: ExpressRouter = Router();

tasksRouter.use(deploymentRoutes);
tasksRouter.use(taskRoutes);
tasksRouter.use(taskRunRoutes);
