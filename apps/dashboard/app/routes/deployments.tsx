import { StatusBadge } from "~/components/status-badge";
import type { Route } from "./+types/deployments";
import { cascadeApiRequest } from "~/lib/cascade-api.server";
import { Link } from "react-router";

type Deployment = {
  id: string;
  environmentId: string;
  version: string;
  image: string;
  status: string;
  runtimeStatus: string;
  runtimeError: string | null;
  runtimeStartedAt: string | null;
  runtimeStoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasksCount: number;
  runsCount: number;
};

export function meta() {
  return [{ title: "Deployments | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    deployments: Deployment[];
  }>("/api/deployments");

  return {
    deployments: response.deployments,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Deployments({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          Back to dashboard
        </Link>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Deployments</h1>

        <p className="mt-2 text-gray-600">
          Deployment versions and worker runtime status in the current environment.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Deployment</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Image</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">State</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Runtime</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tasks</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Runs</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Updated</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loaderData.deployments.map((deployment) => (
              <tr key={deployment.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{deployment.version}</div>
                  <div className="font-mono text-xs text-gray-500">{deployment.id}</div>
                </td>

                <td className="max-w-sm px-4 py-3 font-mono text-xs text-gray-700">
                  <span className="break-all">{deployment.image}</span>
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={deployment.status} />
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={deployment.runtimeStatus} />

                  {deployment.runtimeError ? (
                    <p className="mt-1 max-w-xs break-words text-xs text-red-700">
                      {deployment.runtimeError}
                    </p>
                  ) : null}
                </td>

                <td className="px-4 py-3 text-gray-700">{deployment.tasksCount}</td>

                <td className="px-4 py-3 text-gray-700">{deployment.runsCount}</td>

                <td className="px-4 py-3 text-gray-700">{formatDate(deployment.updatedAt)}</td>
              </tr>
            ))}

            {loaderData.deployments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No deployments exist in this environment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
