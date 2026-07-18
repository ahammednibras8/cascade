import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
  type Router as ExpressRouter,
} from "express";
import { prisma, Prisma } from "@cascade/database";
import { enqueueTaskRun } from "../queue/task-runs.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const tasksRouter: ExpressRouter = Router();

type AsyncRequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>;

function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).then(undefined, next);
  };
}

function getPayload(body: unknown): Prisma.InputJsonValue | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return body as Prisma.InputJsonValue;
  }

  if (!("payload" in body)) {
    return undefined;
  }

  const payload = (body as { payload?: unknown }).payload;

  if (payload === undefined || payload === null) {
    return undefined;
  }

  return payload as Prisma.InputJsonValue;
}

tasksRouter.post(
  "/tasks/:taskId/trigger",
  asyncHandler(async (request, response) => {
    const auth = request.auth;
    const taskIdParam = request.params.taskId;
    const taskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
      return;
    }

    if (!taskId || !UUID_PATTERN.test(taskId)) {
      response.status(400).json({
        error: {
          code: "INVALID_TASK_ID",
          message: "taskId must be a valid UUID",
        },
      });
      return;
    }

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        environmentId: auth.environmentId,
      },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!task) {
      response.status(404).json({
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task was not found in this environment",
        },
      });
      return;
    }

    const payload = getPayload(request.body);

    const taskRun = await prisma.$transaction(async (tx) => {
      const data: Prisma.TaskRunUncheckedCreateInput = {
        taskId: taskId,
        status: "PENDING",
      };

      if (payload !== undefined) {
        data.payload = payload;
      }

      const run = await tx.taskRun.create({
        data,
        select: {
          id: true,
          taskId: true,
          status: true,
          payload: true,
          createdAt: true,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskRunId: run.id,
          type: "task.triggered",
          level: "INFO",
          message: "Task trigger accepted and run is pending",
          data: {
            apiKeyId: auth.apiKeyId,
          },
        },
      });

      return run;
    });

    await enqueueTaskRun({
      runId: taskRun.id,
      taskId: taskRun.taskId,
      environmentId: auth.environmentId,
    });

    response.status(202).json({
      taskRun: {
        id: taskRun.id,
        taskId: taskRun.taskId,
        taskSlug: task.slug,
        taskName: task.name,
        status: taskRun.status,
        payload: taskRun.payload,
        createdAt: taskRun.createdAt.toISOString(),
      },
    });
  }),
);
