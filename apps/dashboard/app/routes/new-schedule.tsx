import type { Route } from "./+types/new-schedule";
import { handleCreateSchedule } from "~/features/schedules/schedule-actions.server";
import { NewSchedulePage } from "~/features/schedules/schedule-form";
import type { ScheduleTask } from "~/features/schedules/types";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

export function meta() {
  return [{ title: "New schedule | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    tasks: ScheduleTask[];
  }>("/api/tasks");

  return {
    tasks: response.tasks,
  };
}

export async function action({ request }: Route.ActionArgs) {
  return handleCreateSchedule(await request.formData());
}

export default function NewSchedule({ loaderData, actionData }: Route.ComponentProps) {
  return <NewSchedulePage tasks={loaderData.tasks} actionData={actionData} />;
}
