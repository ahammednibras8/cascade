import type { ListTasksResponse } from "@cascade/api-contracts";
import { Form, Link } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import type { Task } from "./types";

type TasksListViewProps = {
  tasks: Task[];
  pagination: ListTasksResponse["pagination"];
  search: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TasksListView({ tasks, pagination, search }: TasksListViewProps) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Tasks</h1>
        <p className="mt-2 text-gray-600">Tasks registered in the current environment.</p>
        <TaskFilters search={search} />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Task", "Deployment", "Runs", "Schedules", "Updated"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No tasks registered in this environment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <TaskPagination pagination={pagination} search={search} tasksCount={tasks.length} />
    </main>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          to={`/tasks/${task.id}`}
          className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
        >
          {task.name}
        </Link>
        <div className="font-mono text-xs text-gray-500">{task.slug}</div>
        {task.description ? <p className="mt-1 text-xs text-gray-500">{task.description}</p> : null}
      </td>
      <td className="px-4 py-3">
        {task.deployment ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-700">{task.deployment.version}</span>
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
  );
}

function TaskFilters({ search }: { search: string }) {
  const searchValue = new URLSearchParams(search).get("search") ?? "";

  return (
    <Form method="get" className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="task-search" className="mb-1 block text-sm font-medium text-gray-700">
          Search tasks
        </label>
        <input
          id="task-search"
          name="search"
          type="search"
          defaultValue={searchValue}
          placeholder="Name or slug"
          className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
      >
        Filter tasks
      </button>

      {searchValue ? (
        <Link
          to="/tasks"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          Clear filters
        </Link>
      ) : null}
    </Form>
  );
}

function TaskPagination({
  pagination,
  search,
  tasksCount,
}: {
  pagination: ListTasksResponse["pagination"];
  search: string;
  tasksCount: number;
}) {
  const hasCursor = new URLSearchParams(search).has("cursor");
  const nextPagePath = pagination.nextCursor
    ? createTaskPagePath(search, pagination.nextCursor)
    : null;

  if (pagination.totalCount === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Task pagination"
      className="mt-4 flex items-center justify-between gap-4 text-sm"
    >
      <p className="text-gray-600">
        Showing {tasksCount} task{tasksPlural(tasksCount)} on this page · {pagination.totalCount}{" "}
        total
      </p>

      <div className="flex items-center gap-2">
        {hasCursor ? (
          <Link
            to={createTaskPagePath(search, null)}
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

function createTaskPagePath(search: string, cursor: string | null) {
  const parameters = new URLSearchParams(search);

  if (cursor) {
    parameters.set("cursor", cursor);
  } else {
    parameters.delete("cursor");
  }

  const query = parameters.toString();

  return query ? `/tasks?${query}` : "/tasks";
}

function tasksPlural(count: number) {
  return count === 1 ? "" : "s";
}
