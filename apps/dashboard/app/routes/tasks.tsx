import type { Route } from "./+types/tasks";
import { TasksListView } from "~/features/tasks/tasks-list-view";
import type { Task } from "~/features/tasks/types";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

export function meta() {
  return [{ title: "Tasks | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    tasks: Task[];
  }>("/api/tasks");

  return {
    tasks: response.tasks,
  };
}

export default function Tasks({ loaderData }: Route.ComponentProps) {
  return <TasksListView tasks={loaderData.tasks} />;
}
