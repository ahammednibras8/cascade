import type { Route } from "./+types/edit-schedule";
import { handleUpdateSchedule } from "~/features/schedules/schedule-actions.server";
import { EditSchedulePage } from "~/features/schedules/schedule-form";
import type { Schedule } from "~/features/schedules/types";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

export function meta() {
  return [{ title: "Edit schedule | Cascade" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const response = await cascadeApiRequest<{
    schedule: Schedule;
  }>(`/api/schedules/${encodeURIComponent(params.scheduleId)}`);

  return {
    schedule: response.schedule,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  return handleUpdateSchedule(params.scheduleId, await request.formData());
}

export default function EditSchedule({ loaderData, actionData }: Route.ComponentProps) {
  return <EditSchedulePage schedule={loaderData.schedule} actionData={actionData} />;
}
