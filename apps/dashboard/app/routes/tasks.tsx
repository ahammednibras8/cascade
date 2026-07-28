import type { Route } from "./+types/tasks";
import { Link } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

export function meta() {
  return [{ title: "Tasks | Cascade" }];
}

type Task = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  deployment: {
    id: string;
    version: string;
    status: string;
  } | null;
  runsCount: number;
  schedulesCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function loader() {
  const response = await cascadeApiRequest<{
    tasks: Task[];
  }>("/api/tasks");

  return {
    tasks: response.tasks,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Tasks({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          Back to dashboard
        </Link>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Tasks</h1>

        <p className="mt-2 text-gray-600">Tasks registered in the current environment.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Task</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Deployment</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Runs</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Schedules</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Updated</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loaderData.tasks.map((task) => (
              <tr key={task.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{task.name}</div>
                  <div className="font-mono text-xs text-gray-500">{task.slug}</div>

                  {task.description ? (
                    <p className="mt-1 text-xs text-gray-500">{task.description}</p>
                  ) : null}
                </td>

                <td className="px-4 py-3">
                  {task.deployment ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-700">
                        {task.deployment.version}
                      </span>
                      <StatusBadge status={task.deployment.status} />
                    </div>
                  ) : (
                    <span className="text-gray-500">No deployment</span>
                  )}
                </td>

                <td className="px-4 py-3 text-gray-700">{task.runsCount}</td>

                <td className="px-4 py-3 text-gray-700">{task.schedulesCount}</td>

                <td className="px-4 py-3 text-gray-700">{formatDate(task.updatedAt)}</td>
              </tr>
            ))}

            {loaderData.tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No tasks registered in this environment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
