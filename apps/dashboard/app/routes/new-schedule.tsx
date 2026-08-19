import type { Route } from "./+types/new-schedule";
import { handleCreateSchedule } from "~/features/schedules/schedule-actions.server";
import { NewSchedulePage } from "~/features/schedules/schedule-form";
import type { ScheduleTask } from "~/features/schedules/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

export function meta() {
  return [{ title: "New schedule | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeDashboardApiRequest<{
    tasks: ScheduleTask[];
  }>(request, "/api/tasks");

  return {
    tasks: response.tasks,
  };
}

export async function action({ request }: Route.ActionArgs) {
  return handleCreateSchedule(request, await request.formData());
}

export default function NewSchedule({ loaderData, actionData }: Route.ComponentProps) {
  return <NewSchedulePage tasks={loaderData.tasks} actionData={actionData} />;
}
