import type { Route } from "./+types/schedules";
import { handleScheduleListAction } from "~/features/schedules/schedule-actions.server";
import { SchedulesListView } from "~/features/schedules/schedules-list-view";
import type { Schedule } from "~/features/schedules/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

export function meta() {
  return [{ title: "Schedules | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeDashboardApiRequest<{
    schedules: Schedule[];
  }>(request, "/api/schedules");

  return {
    schedules: response.schedules,
  };
}

export async function action({ request }: Route.ActionArgs) {
  return handleScheduleListAction(request, await request.formData());
}

export default function Schedules({ loaderData }: Route.ComponentProps) {
  return <SchedulesListView schedules={loaderData.schedules} />;
}
