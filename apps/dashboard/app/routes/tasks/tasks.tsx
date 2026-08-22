import { ListTasksResponseSchema, type ListTasksResponse } from "@cascade/api-contracts";
import type { Route } from "./+types/tasks";
import { TasksListView } from "~/features/tasks/tasks-list-view";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";

export function meta() {
  return [{ title: "Tasks | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const url = new URL(request.url);

  const response = await cascadeDashboardApiRequest<ListTasksResponse>(
    request,
    `/api/tasks${url.search}`,
    {
      responseSchema: ListTasksResponseSchema,
    },
  );

  return {
    tasks: response.tasks,
    pagination: response.pagination,
    search: url.search,
  };
}

export default function Tasks({ loaderData }: Route.ComponentProps) {
  return (
    <TasksListView
      tasks={loaderData.tasks}
      pagination={loaderData.pagination}
      search={loaderData.search}
    />
  );
}
