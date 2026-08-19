import { TaskDetailView, TaskNotFound } from "~/features/tasks/task-detail-view";
import type { Route } from "./+types/task-detail";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import type { TaskDetail } from "~/features/tasks/types";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

export function meta() {
  return [{ title: "Task detail | Cascade" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const taskId = params.taskId;

  try {
    const response = await cascadeDashboardApiRequest<{
      task: TaskDetail;
    }>(request, `/api/tasks/${encodeURIComponent(taskId)}`);

    return {
      task: response.task,
      taskId,
    };
  } catch (error) {
    if (isTaskNotFoundError(error)) {
      return {
        task: null,
        taskId,
      };
    }

    throw error;
  }
}

function isTaskNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  const candidate = error as {
    status?: unknown;
    responseBody?: {
      error?: {
        code?: unknown;
      };
    };
  };

  return candidate.status === 404 && candidate.responseBody?.error?.code === "TASK_NOT_FOUND";
}

export default function TaskDetail({ loaderData }: Route.ComponentProps) {
  return loaderData.task ? (
    <TaskDetailView task={loaderData.task} />
  ) : (
    <TaskNotFound taskId={loaderData.taskId} />
  );
}
