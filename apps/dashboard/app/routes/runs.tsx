import type { Route } from "./+types/runs";
import { RunsListView } from "~/features/runs/runs-list-view";
import type { TaskRunListItem } from "~/features/runs/types";
import { cascadeApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

type ApiTaskRunListItem = {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
  task: {
    slug: string;
    name: string;
    environment: {
      slug: string;
      project: {
        slug: string;
        name: string;
      };
    };
  };
  attemptsCount: number;
  eventsCount: number;
};

export function meta() {
  return [{ title: "Runs | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeApiRequest<{
    taskRuns: ApiTaskRunListItem[];
  }>("/api/runs");

  return {
    runs: response.taskRuns.map(toTaskRunListItem),
  };
}

function toTaskRunListItem(run: ApiTaskRunListItem): TaskRunListItem {
  return {
    id: run.id,
    status: run.status,
    taskSlug: run.task.slug,
    taskName: run.task.name,
    environmentSlug: run.task.environment.slug,
    projectSlug: run.task.environment.project.slug,
    projectName: run.task.environment.project.name,
    attemptsCount: run.attemptsCount,
    eventsCount: run.eventsCount,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    lastHeartbeatAt: run.lastHeartbeatAt,
    completedAt: run.completedAt,
  };
}

export default function Runs({ loaderData }: Route.ComponentProps) {
  return <RunsListView runs={loaderData.runs} />;
}
