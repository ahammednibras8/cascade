import type { Route } from "./+types/schedules";
import { handleScheduleListAction } from "~/features/schedules/schedule-actions.server";
import { SchedulesListView } from "~/features/schedules/schedules-list-view";
import type { Schedule } from "~/features/schedules/types";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

export function meta() {
  return [{ title: "Schedules | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    schedules: Schedule[];
  }>("/api/schedules");

  return {
    schedules: response.schedules,
  };
}

export async function action({ request }: Route.ActionArgs) {
  return handleScheduleListAction(await request.formData());
}

export default function Schedules({ loaderData }: Route.ComponentProps) {
  return <SchedulesListView schedules={loaderData.schedules} />;
}
