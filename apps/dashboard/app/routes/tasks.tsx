import type { Route } from "./+types/tasks";
import { TasksListView } from "~/features/tasks/tasks-list-view";
import type { Task } from "~/features/tasks/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

export function meta() {
  return [{ title: "Tasks | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeDashboardApiRequest<{
    tasks: Task[];
  }>(request, "/api/tasks");

  return {
    tasks: response.tasks,
  };
}

export default function Tasks({ loaderData }: Route.ComponentProps) {
  return <TasksListView tasks={loaderData.tasks} />;
}
