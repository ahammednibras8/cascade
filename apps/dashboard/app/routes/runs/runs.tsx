import { ListTaskRunsResponseSchema, type ListTaskRunsResponse } from "@cascade/api-contracts";
import type { Route } from "./+types/runs";
import { RunsListView } from "~/features/runs/runs-list-view";
import type { TaskRunListItem } from "~/features/runs/types";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";

type ApiTaskRunListItem = ListTaskRunsResponse["taskRuns"][number];

export function meta() {
  return [{ title: "Runs | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const url = new URL(request.url);

  const response = await cascadeDashboardApiRequest<ListTaskRunsResponse>(
    request,
    `/api/runs${url.search}`,
    {
      responseSchema: ListTaskRunsResponseSchema,
    },
  );

  return {
    runs: response.taskRuns.map(toTaskRunListItem),
    pagination: response.pagination,
    search: url.search,
  };
}

function toTaskRunListItem(run: ApiTaskRunListItem): TaskRunListItem {
  return {
    id: run.id,
    status: run.status,
    taskSlug: run.task.slug,
    taskName: run.task.name,
    environmentSlug: run.task.environment.slug,
    projectSlug: run.task.environment.project.slug,
    projectName: run.task.environment.project.name,
    attemptsCount: run.attemptsCount,
    eventsCount: run.eventsCount,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    lastHeartbeatAt: run.lastHeartbeatAt,
    completedAt: run.completedAt,
  };
}

export default function Runs({ loaderData }: Route.ComponentProps) {
  return (
    <RunsListView
      runs={loaderData.runs}
      pagination={loaderData.pagination}
      search={loaderData.search}
    />
  );
}
