import type { Route } from "./+types/schedules";
import { handleScheduleListAction } from "~/features/schedules/schedule-actions.server";
import { SchedulesListView } from "~/features/schedules/schedules-list-view";
import type { Schedule } from "~/features/schedules/types";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";
import { requireDashboardCapability } from "~/lib/auth/dashboard-permissions.server";
import { getDashboardWorkspaceContext } from "~/lib/workspace/dashboard-workspace.server";

export function meta() {
  return [{ title: "Schedules | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireDashboardUser(request);
  const workspace = await getDashboardWorkspaceContext(request, session.userId);

  const response = await cascadeDashboardApiRequest<{
    schedules: Schedule[];
  }>(request, "/api/schedules");

  return {
    schedules: response.schedules,
    role: workspace.activeOrganization?.role ?? null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireDashboardCapability(request, "SCHEDULES_MANAGE");
  return handleScheduleListAction(request, await request.formData());
}

export default function Schedules({ loaderData }: Route.ComponentProps) {
  return <SchedulesListView schedules={loaderData.schedules} role={loaderData.role} />;
}
