import { ListTasksResponseSchema } from "@cascade/api-contracts";
import type { Route } from "./+types/tasks";
import { TasksListView } from "~/features/tasks/tasks-list-view";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";

export function meta() {
  return [{ title: "Tasks | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeDashboardApiRequest(request, "/api/tasks", {
    responseSchema: ListTasksResponseSchema,
  });

  return {
    tasks: response.tasks,
  };
}

export default function Tasks({ loaderData }: Route.ComponentProps) {
  return <TasksListView tasks={loaderData.tasks} />;
}
