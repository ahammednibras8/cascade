import { Link } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import { formatDeploymentDate } from "./format";
import type { DeploymentListItem } from "./types";
import type { ListDeploymentsResponse } from "@cascade/api-contracts";

type DeploymentsListViewProps = {
  deployments: DeploymentListItem[];
  pagination: ListDeploymentsResponse["pagination"];
  search: string;
};

export function DeploymentsListView({ deployments, pagination, search }: DeploymentsListViewProps) {
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
              {["Deployment", "Image", "State", "Runtime", "Tasks", "Runs", "Updated"].map(
                (heading) => (
                  <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deployments.map((deployment) => (
              <DeploymentRow key={deployment.id} deployment={deployment} />
            ))}
            {deployments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No deployments exist in this environment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <DeploymentPagination
        pagination={pagination}
        search={search}
        deploymentsCount={deployments.length}
      />
    </main>
  );
}

function DeploymentRow({ deployment }: { deployment: DeploymentListItem }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          to={`/deployments/${deployment.id}`}
          className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
        >
          {deployment.version}
        </Link>
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
      <td className="px-4 py-3 text-gray-700">
        {formatDeploymentDate(deployment.updatedAt, "short")}
      </td>
    </tr>
  );
}

function DeploymentPagination({
  pagination,
  search,
  deploymentsCount,
}: {
  pagination: ListDeploymentsResponse["pagination"];
  search: string;
  deploymentsCount: number;
}) {
  const hasCursor = new URLSearchParams(search).has("cursor");
  const nextPagePath = pagination.nextCursor
    ? createDeploymentPagePath(search, pagination.nextCursor)
    : null;

  if (pagination.totalCount === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Deployment pagination"
      className="mt-4 flex items-center justify-between gap-4 text-sm"
    >
      <p className="text-gray-600">
        Showing {deploymentsCount} deployment{deploymentsPlural(deploymentsCount)} on this page ·{" "}
        {pagination.totalCount} total
      </p>

      <div className="flex items-center gap-2">
        {hasCursor ? (
          <Link
            to={createDeploymentPagePath(search, null)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-900"
          >
            First page
          </Link>
        ) : null}

        {nextPagePath ? (
          <Link to={nextPagePath} className="rounded-md bg-black px-3 py-2 font-medium text-white">
            Next page
          </Link>
        ) : (
          <span className="px-3 py-2 text-gray-500">End of list</span>
        )}
      </div>
    </nav>
  );
}

function createDeploymentPagePath(search: string, cursor: string | null) {
  const parameters = new URLSearchParams(search);

  if (cursor) {
    parameters.set("cursor", cursor);
  } else {
    parameters.delete("cursor");
  }

  const query = parameters.toString();

  return query ? `/deployments?${query}` : "/deployments";
}

function deploymentsPlural(count: number) {
  return count === 1 ? "" : "s";
}
