import type { Route } from "./+types/edit-schedule";
import { handleUpdateSchedule } from "~/features/schedules/schedule-actions.server";
import { EditSchedulePage } from "~/features/schedules/schedule-form";
import { TaskScheduleDetailResponseSchema } from "@cascade/api-contracts";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";
import { requireDashboardCapability } from "~/lib/auth/dashboard-permissions.server";

export function meta() {
  return [{ title: "Edit schedule | Cascade" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeDashboardApiRequest(
    request,
    `/api/schedules/${encodeURIComponent(params.scheduleId)}`,
    {
      responseSchema: TaskScheduleDetailResponseSchema,
    },
  );

  return {
    schedule: response.schedule,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireDashboardCapability(request, "SCHEDULES_MANAGE");
  return handleUpdateSchedule(request, params.scheduleId, await request.formData());
}

export default function EditSchedule({ loaderData, actionData }: Route.ComponentProps) {
  return <EditSchedulePage schedule={loaderData.schedule} actionData={actionData} />;
}
