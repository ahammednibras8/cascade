import { useEffect, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import type { EnvironmentRunsStreamState } from "~/lib/realtime/environment-runs-stream";
import { environmentRunsStreamLabel, formatRunDate } from "./format";
import type { TaskRunListItem } from "./types";
import { CursorPagination } from "~/components/cursor-pagination";
import { createListPath } from "~/lib/pagination/cursor-pagination";
import type { ListTaskRunsResponse } from "@cascade/api-contracts";

type RunsListViewProps = {
  runs: TaskRunListItem[];
  pagination: ListTaskRunsResponse["pagination"];
  search: string;
};

export function RunsListView({ runs, pagination, search }: RunsListViewProps) {
  const revalidator = useRevalidator();
  const [streamState, setStreamState] = useState<EnvironmentRunsStreamState>("connecting");
  const revalidate = revalidator.revalidate;

  useEffect(() => {
    let stop: (() => void) | undefined;
    let canceled = false;

    void import("~/lib/realtime/environment-runs-stream").then(
      ({ connectEnvironmentRunsStream }) => {
        if (canceled) {
          return undefined;
        }

        stop = connectEnvironmentRunsStream({
          onRunsChanged() {
            void revalidate();
          },
          onStateChange: setStreamState,
        });

        return undefined;
      },
    );

    return () => {
      canceled = true;
      stop?.();
    };
  }, [revalidate]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <p className="text-sm text-gray-500">Cascade</p>
        <h1 className="text-3xl font-semibold tracking-tight">Task runs</h1>
        <p className="mt-2 text-gray-600">Latest durable task runs from Postgres</p>

        <RunStatusFilters search={search} />

        <p className="mt-1 text-xs text-gray-500">
          {environmentRunsStreamLabel({ revalidatorState: revalidator.state, streamState })}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {[
                "Run",
                "Status",
                "Task",
                "Project",
                "Attempts",
                "Events",
                "Created",
                "Completed",
              ].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
            {runs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>
                  No task runs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <CursorPagination
        ariaLabel="Run pagination"
        pathname="/runs"
        search={search}
        itemCount={runs.length}
        itemLabel="run"
        pagination={pagination}
      />
    </main>
  );
}

function RunRow({ run }: { run: TaskRunListItem }) {
  return (
    <tr>
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
      <td className="px-4 py-3 text-gray-700">{formatRunDate(run.createdAt)}</td>
      <td className="px-4 py-3 text-gray-700">{formatRunDate(run.completedAt)}</td>
    </tr>
  );
}

const runStatuses = ["PENDING", "EXECUTING", "COMPLETED", "FAILED", "CANCELED"] as const;

function RunStatusFilters({ search }: { search: string }) {
  const activeStatus = new URLSearchParams(search).get("status");

  return (
    <nav aria-label="Run status filters" className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium text-gray-700">Status:</span>

      <Link
        to={createRunStatusPath(search, null)}
        className={runStatusFilterClass(activeStatus === null)}
      >
        All statuses
      </Link>

      {runStatuses.map((status) => (
        <Link
          key={status}
          to={createRunStatusPath(search, status)}
          className={runStatusFilterClass(activeStatus === status)}
        >
          {status}
        </Link>
      ))}
    </nav>
  );
}

function createRunStatusPath(search: string, status: string | null) {
  const parameters = new URLSearchParams(search);

  parameters.delete("cursor");

  if (status) {
    parameters.set("status", status);
  } else {
    parameters.delete("status");
  }

  return createListPath("/runs", parameters);
}

function runStatusFilterClass(isActive: boolean) {
  return isActive
    ? "rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
    : "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900";
}
