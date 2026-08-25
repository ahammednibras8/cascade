import type { Route } from "./+types/schedules";
import { handleScheduleListAction } from "~/features/schedules/schedule-actions.server";
import { SchedulesListView } from "~/features/schedules/schedules-list-view";
import {
  ListTaskSchedulesResponseSchema,
  type ListTaskSchedulesResponse,
} from "@cascade/api-contracts";
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
  const url = new URL(request.url);

  const response = await cascadeDashboardApiRequest<ListTaskSchedulesResponse>(
    request,
    `/api/schedules${url.search}`,
    {
      responseSchema: ListTaskSchedulesResponseSchema,
    },
  );

  return {
    schedules: response.schedules,
    pagination: response.pagination,
    search: url.search,
    role: workspace.activeOrganization?.role ?? null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireDashboardCapability(request, "SCHEDULES_MANAGE");
  return handleScheduleListAction(request, await request.formData());
}

export default function Schedules({ loaderData }: Route.ComponentProps) {
  return (
    <SchedulesListView
      schedules={loaderData.schedules}
      pagination={loaderData.pagination}
      search={loaderData.search}
      role={loaderData.role}
    />
  );
}
