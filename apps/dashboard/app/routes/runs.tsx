import type { Route } from "./+types/runs";
import { Link } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

export function meta() {
  return [{ title: "Runs | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    taskRuns: Array<{
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
    }>;
  }>("/api/runs");

  return {
    runs: response.taskRuns.map((run) => ({
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
    })),
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function Runs({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <p className="text-sm text-gray-500">Cascade</p>
        <h1 className="text-3xl font-semibold tracking-tight">Task runs</h1>
        <p className="mt-2 text-gray-600">Latest durable task runs from Postgres</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Run</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Task</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Project</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Attempts</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Events</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Completed</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loaderData.runs.map((run) => (
              <tr key={run.id}>
                <td className="px-4 py-3 font-mono text-xs">
                  <Link to={`/runs/${run.id}`} className="text-blue-700 hover:underline">
                    {run.id}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{run.taskName}</div>
                  <div className="text-xs text-gray-500">{run.taskSlug}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{run.projectName}</div>
                  <div className="text-xs text-gray-500">
                    {run.projectSlug}/{run.environmentSlug}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{run.attemptsCount}</td>
                <td className="px-4 py-3 text-gray-700">{run.eventsCount}</td>
                <td className="px-4 py-3 text-gray-700">{formatDate(run.createdAt)}</td>
                <td className="px-4 py-3 text-gray-700">{formatDate(run.completedAt)}</td>
              </tr>
            ))}

            {loaderData.runs.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>
                  No task runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
