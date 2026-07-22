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
import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

const taskRunSelect = {
  id: true,
  taskId: true,
  status: true,
  payload: true,
  createdAt: true,
  idempotencyRequestHash: true,
} satisfies Prisma.TaskRunSelect;

function getIdempotencyKey(request: Request) {
  const idempotencyKey = request.get("idempotency-key")?.trim();

  if (!idempotencyKey) {
    return undefined;
  }

  return idempotencyKey;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).toSorted(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`)
    .join(",")}}`;
}

function hashTriggerRequest(input: { taskId: string; payload: Prisma.InputJsonValue | undefined }) {
  return hashValue(
    stableJsonStringify({
      taskId: input.taskId,
      payload: input.payload ?? null,
    }),
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function findExistingIdempotentTaskRun(taskId: string, idempotencyKeyHash: string) {
  return prisma.taskRun.findFirst({
    where: {
      taskId,
      idempotencyKeyHash,
    },
    select: taskRunSelect,
  });
}

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

function createCancelError(input: {
  apiKeyId: string;
  previousStatus: string;
}): Prisma.InputJsonValue {
  return {
    code: "RUN_CANCELED",
    message: "Task run was canceled",
    apiKeyId: input.apiKeyId,
    previousStatus: input.previousStatus,
  };
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

    const idempotencyKey = getIdempotencyKey(request);

    if (idempotencyKey && idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      response.status(400).json({
        error: {
          code: "INVALID_IDEMPOTENCY_KEY",
          message: `Idempotency-Key must be ${IDEMPOTENCY_KEY_MAX_LENGTH} characters or fewer`,
        },
      });
      return;
    }

    const idempotencyKeyHash = idempotencyKey ? hashValue(idempotencyKey) : undefined;
    const idempotencyRequestHash = idempotencyKeyHash
      ? hashTriggerRequest({
          taskId,
          payload,
        })
      : undefined;

    let taskRun = idempotencyKeyHash
      ? await findExistingIdempotentTaskRun(taskId, idempotencyKeyHash)
      : null;

    let created = false;

    if (taskRun) {
      if (taskRun.idempotencyRequestHash !== idempotencyRequestHash) {
        response.status(409).json({
          error: {
            code: "IDEMPOTENCY_CONFLICT",
            message: "This Idempotency-Key was already used with a different trigger request",
          },
        });
        return;
      }
    } else {
      created = true;

      try {
        taskRun = await prisma.$transaction(async (tx) => {
          const data: Prisma.TaskRunUncheckedCreateInput = {
            taskId,
            status: "PENDING",
          };

          if (payload !== undefined) {
            data.payload = payload;
          }

          if (idempotencyKeyHash && idempotencyRequestHash) {
            data.idempotencyKeyHash = idempotencyKeyHash;
            data.idempotencyRequestHash = idempotencyRequestHash;
          }

          const run = await tx.taskRun.create({
            data,
            select: taskRunSelect,
          });

          const eventData: Record<string, Prisma.InputJsonValue> = {
            apiKeyId: auth.apiKeyId,
          };

          if (idempotencyKeyHash) {
            eventData.idempotencyKeyHash = idempotencyKeyHash;
          }

          await tx.taskEvent.create({
            data: {
              taskRunId: run.id,
              type: "task.triggered",
              level: "INFO",
              message: "Task trigger accepted and run is pending",
              data: eventData,
            },
          });

          return run;
        });
      } catch (error) {
        if (!idempotencyKeyHash || !idempotencyRequestHash || !isUniqueConstraintError(error)) {
          throw error;
        }

        const existingRun = await findExistingIdempotentTaskRun(taskId, idempotencyKeyHash);

        if (!existingRun) {
          throw error;
        }

        if (existingRun.idempotencyRequestHash !== idempotencyRequestHash) {
          response.status(409).json({
            error: {
              code: "IDEMPOTENCY_CONFLICT",
              message: "This Idempotency-Key was already used with a different trigger request",
            },
          });
          return;
        }

        taskRun = existingRun;
        created = false;
      }
    }

    if (!taskRun) {
      throw new Error("TaskRun was not created or loaded");
    }

    if (created) {
      await enqueueTaskRun({
        runId: taskRun.id,
        taskId: taskRun.taskId,
        environmentId: auth.environmentId,
      });
    }

    response
      .status(created ? 202 : 200)
      .set("Idempotent-Replayed", created ? "false" : "true")
      .json({
        taskRun: {
          id: taskRun.id,
          taskId: taskRun.taskId,
          taskSlug: task.slug,
          taskName: task.name,
          status: taskRun.status,
          payload: taskRun.payload,
          createdAt: taskRun.createdAt.toISOString(),
          idempotentReplay: !created,
        },
      });
  }),
);

tasksRouter.post(
  "/runs/:runId/cancel",
  asyncHandler(async (request, response) => {
    const auth = request.auth;
    const runIdParam = request.params.runId;
    const runId = Array.isArray(runIdParam) ? runIdParam[0] : runIdParam;

    if (!auth) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API authentication context",
        },
      });
      return;
    }

    if (!runId || !UUID_PATTERN.test(runId)) {
      response.status(400).json({
        error: {
          code: "INVALID_RUN_ID",
          message: "runId must be a valid UUID",
        },
      });
      return;
    }

    const run = await prisma.taskRun.findFirst({
      where: {
        id: runId,
        task: {
          environmentId: auth.environmentId,
        },
      },
      select: {
        id: true,
        taskId: true,
        status: true,
        attempts: {
          orderBy: {
            attemptNumber: "desc",
          },
          take: 1,
          select: {
            id: true,
            status: true,
            attemptNumber: true,
          },
        },
      },
    });

    if (!run) {
      response.status(404).json({
        error: {
          code: "RUN_NOT_FOUND",
          message: "Task run was not found in this environment",
        },
      });
      return;
    }

    if (run.status === "CANCELED") {
      response.status(200).json({
        taskRun: {
          id: run.id,
          taskId: run.taskId,
          status: run.status,
          canceled: true,
          alreadyCanceled: true,
        },
      });
      return;
    }

    if (run.status === "COMPLETED" || run.status === "FAILED") {
      response.status(409).json({
        error: {
          code: "RUN_NOT_CANCELABLE",
          message: `Cannot cancel a run with status ${run.status}`,
        },
      });
      return;
    }

    const now = new Date();
    const latestAttempt = run.attempts[0];
    const error = createCancelError({
      apiKeyId: auth.apiKeyId,
      previousStatus: run.status,
    });

    const canceled = await prisma.$transaction(async (tx) => {
      const updateRun = await tx.taskRun.updateMany({
        where: {
          id: run.id,
          status: {
            in: ["PENDING", "EXECUTING"],
          },
        },
        data: {
          status: "CANCELED",
          output: Prisma.DbNull,
          error,
          lastHeartbeatAt: now,
          completedAt: now,
        },
      });

      if (updateRun.count !== 1) {
        return false;
      }

      if (latestAttempt && latestAttempt.status === "EXECUTING") {
        await tx.taskAttempt.update({
          where: {
            id: latestAttempt.id,
          },
          data: {
            status: "CANCELED",
            error,
            completedAt: now,
          },
        });
      }

      await tx.taskEvent.create({
        data: {
          taskRunId: run.id,
          ...(latestAttempt ? { taskAttemptId: latestAttempt.id } : {}),
          type: "task.run.canceled",
          level: "WARN",
          message: "Task run canceled by API request",
          data: {
            apiKeyId: auth.apiKeyId,
            previousStatus: run.status,
            attemptNumber: latestAttempt?.attemptNumber ?? null,
          },
        },
      });

      return true;
    });

    if (!canceled) {
      response.status(409).json({
        error: {
          code: "RUN_NOT_CANCELABLE",
          message: "Task run status changed before it could be canceled",
        },
      });
      return;
    }

    response.status(200).json({
      taskRun: {
        id: run.id,
        taskId: run.taskId,
        status: "CANCELED",
        canceled: true,
        alreadyCanceled: false,
      },
    });
  }),
);
