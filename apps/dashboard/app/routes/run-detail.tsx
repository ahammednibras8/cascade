import type { Route } from "./+types/run-detail";
import { isRunNotFoundError } from "~/features/runs/errors";
import { RunDetailView, RunNotFound } from "~/features/runs/run-detail-view";
import type { TaskRunDetail, TaskRunEvent } from "~/features/runs/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

type TaskRunWithoutEvents = Omit<TaskRunDetail, "events">;

export function meta() {
  return [{ title: "Run detail | Cascade" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const runId = params.runId;

  try {
    const runResponse = await cascadeDashboardApiRequest<{
      taskRun: TaskRunWithoutEvents;
    }>(request, `/api/runs/${encodeURIComponent(runId)}`);
    const eventsResponse = await cascadeDashboardApiRequest<{
      events: TaskRunEvent[];
    }>(request, `/api/runs/${encodeURIComponent(runId)}/events`);

    return {
      run: {
        ...runResponse.taskRun,
        events: eventsResponse.events,
      },
      runId,
    };
  } catch (error) {
    if (isRunNotFoundError(error)) {
      return {
        run: null,
        runId,
      };
    }

    throw error;
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "cancel" && intent !== "replay") {
    throw new Response("Invalid action", {
      status: 400,
    });
  }

  try {
    const runId = encodeURIComponent(params.runId);
    const path = intent === "cancel" ? `/api/runs/${runId}/cancel` : `/api/runs/${runId}/replay`;

    return await cascadeDashboardApiRequest<{
      taskRun: {
        id: string;
        status: string;
      };
    }>(request, path, {
      method: "POST",
    });
  } catch (error) {
    throw new Response("Could not update task run", {
      status: getErrorStatus(error),
    });
  }
}

function getErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 500;
}

export default function RunDetail({ loaderData }: Route.ComponentProps) {
  return loaderData.run ? (
    <RunDetailView run={loaderData.run} />
  ) : (
    <RunNotFound runId={loaderData.runId} />
  );
}
