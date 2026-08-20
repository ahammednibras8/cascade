import type { Route } from "./+types/new-schedule";
import { handleCreateSchedule } from "~/features/schedules/schedule-actions.server";
import { NewSchedulePage } from "~/features/schedules/schedule-form";
import type { ScheduleTask } from "~/features/schedules/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardCapability } from "~/lib/dashboard-permissions.server";

export function meta() {
  return [{ title: "New schedule | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardCapability(request, "SCHEDULES_MANAGE");

  const response = await cascadeDashboardApiRequest<{
    tasks: ScheduleTask[];
  }>(request, "/api/tasks");

  return {
    tasks: response.tasks,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireDashboardCapability(request, "SCHEDULES_MANAGE");
  return handleCreateSchedule(request, await request.formData());
}

export default function NewSchedule({ loaderData, actionData }: Route.ComponentProps) {
  return <NewSchedulePage tasks={loaderData.tasks} actionData={actionData} />;
}
