import { Form, Link, useNavigation } from "react-router";
import { formatScheduleDate, formatScheduleRule } from "./format";
import type { Schedule } from "./types";
import { hasDashboardCapability, type DashboardRole } from "~/lib/auth/dashboard-permissions";
import type { ListTaskSchedulesResponse } from "@cascade/api-contracts";

type SchedulesListViewProps = {
  schedules: Schedule[];
  pagination: ListTaskSchedulesResponse["pagination"];
  search: string;
  role: DashboardRole | null;
};

export function SchedulesListView({ schedules, pagination, search, role }: SchedulesListViewProps) {
  const navigation = useNavigation();
  const submittingScheduleId = navigation.formData?.get("scheduleId");
  const canManage = hasDashboardCapability(role, "SCHEDULES_MANAGE");

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          Back to dashboard
        </Link>
        <div className="mt-3 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Schedules</h1>
          {canManage ? (
            <Link
              to="/schedules/new"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
            >
              New schedule
            </Link>
          ) : null}
        </div>
        <p className="mt-2 text-gray-600">Task schedules in the current environment.</p>
        <ScheduleFilters search={search} />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Schedule", "Task", "Rule", "Next run", "Last run", "State"]
                .concat(canManage ? ["Actions"] : [])
                .map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                    {heading}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {schedules.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                schedule={schedule}
                canManage={canManage}
                isSubmitting={submittingScheduleId === schedule.id}
              />
            ))}
            {schedules.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                  No schedules in this environment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <SchedulePagination
        pagination={pagination}
        search={search}
        schedulesCount={schedules.length}
      />
    </main>
  );
}

function ScheduleRow({
  schedule,
  isSubmitting,
  canManage,
}: {
  schedule: Schedule;
  isSubmitting: boolean;
  canManage: boolean;
}) {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{schedule.name}</div>
        <div className="font-mono text-xs text-gray-500">{schedule.id}</div>
        {schedule.hasPayload ? <div className="mt-1 text-xs text-gray-500">Has payload</div> : null}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{schedule.task.name}</div>
        <div className="font-mono text-xs text-gray-500">{schedule.task.slug}</div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-gray-700">{formatScheduleRule(schedule)}</td>
      <td className="px-4 py-3 text-gray-700">{formatScheduleDate(schedule.nextRunAt)}</td>
      <td className="px-4 py-3 text-gray-700">{formatScheduleDate(schedule.lastRunAt)}</td>
      <td className="px-4 py-3">
        <span
          className={
            schedule.enabled
              ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"
              : "rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
          }
        >
          {schedule.enabled ? "Enabled" : "Paused"}
        </span>
      </td>
      {canManage ? (
        <td className="px-4 py-3">
          <ScheduleActions schedule={schedule} isSubmitting={isSubmitting} />
        </td>
      ) : null}
    </tr>
  );
}

function ScheduleActions({
  schedule,
  isSubmitting,
}: {
  schedule: Schedule;
  isSubmitting: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        to={`/schedules/${schedule.id}/edit`}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-900"
      >
        Edit schedule
      </Link>
      <ScheduleActionForm
        schedule={schedule}
        intent={schedule.enabled ? "pause" : "resume"}
        label={schedule.enabled ? "Pause schedule" : "Resume schedule"}
        isSubmitting={isSubmitting}
      />
      <ScheduleActionForm
        schedule={schedule}
        intent="delete"
        label="Delete schedule"
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

function ScheduleActionForm({
  schedule,
  intent,
  label,
  isSubmitting,
}: {
  schedule: Schedule;
  intent: "pause" | "resume" | "delete";
  label: string;
  isSubmitting: boolean;
}) {
  return (
    <Form method="post">
      <input type="hidden" name="scheduleId" value={schedule.id} />
      <button
        type="submit"
        name="intent"
        value={intent}
        disabled={isSubmitting}
        onClick={(event) => {
          if (intent === "delete" && !window.confirm(`Delete schedule "${schedule.name}"?`)) {
            event.preventDefault();
          }
        }}
        className={intent === "delete" ? deleteButtonClass : updateButtonClass(intent)}
      >
        {isSubmitting ? "Updating..." : label}
      </button>
    </Form>
  );
}

const deleteButtonClass =
  "rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50";

function updateButtonClass(intent: "pause" | "resume") {
  return intent === "pause"
    ? "rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50";
}

function SchedulePagination({
  pagination,
  search,
  schedulesCount,
}: {
  pagination: ListTaskSchedulesResponse["pagination"];
  search: string;
  schedulesCount: number;
}) {
  const hasCursor = new URLSearchParams(search).has("cursor");
  const nextPagePath = pagination.nextCursor
    ? createSchedulePagePath(search, pagination.nextCursor)
    : null;

  if (pagination.totalCount === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Schedule pagination"
      className="mt-4 flex items-center justify-between gap-4 text-sm"
    >
      <p className="text-gray-600">
        Showing {schedulesCount} schedule{schedulesPlural(schedulesCount)} on this page ·{" "}
        {pagination.totalCount} total
      </p>

      <div className="flex items-center gap-2">
        {hasCursor ? (
          <Link
            to={createSchedulePagePath(search, null)}
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

function createSchedulePagePath(search: string, cursor: string | null) {
  const parameters = new URLSearchParams(search);

  if (cursor) {
    parameters.set("cursor", cursor);
  } else {
    parameters.delete("cursor");
  }

  return createScheduleListPath(parameters);
}

function schedulesPlural(count: number) {
  return count === 1 ? "" : "s";
}

const scheduleTypes = ["INTERVAL", "CRON"] as const;

function ScheduleFilters({ search }: { search: string }) {
  const parameters = new URLSearchParams(search);
  const enabled = parameters.get("enabled");
  const scheduleType = parameters.get("scheduleType");

  return (
    <div className="mt-4 space-y-3">
      <nav aria-label="Schedule state filters" className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium text-gray-700">State:</span>

        <Link
          to={createScheduleFilterPath(search, "enabled", null)}
          className={scheduleFilterClass(enabled === null)}
        >
          All states
        </Link>

        <Link
          to={createScheduleFilterPath(search, "enabled", "true")}
          className={scheduleFilterClass(enabled === "true")}
        >
          Enabled
        </Link>

        <Link
          to={createScheduleFilterPath(search, "enabled", "false")}
          className={scheduleFilterClass(enabled === "false")}
        >
          Paused
        </Link>
      </nav>

      <nav aria-label="Schedule type filters" className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium text-gray-700">Type:</span>

        <Link
          to={createScheduleFilterPath(search, "scheduleType", null)}
          className={scheduleFilterClass(scheduleType === null)}
        >
          All types
        </Link>

        {scheduleTypes.map((type) => (
          <Link
            key={type}
            to={createScheduleFilterPath(search, "scheduleType", type)}
            className={scheduleFilterClass(scheduleType === type)}
          >
            {type}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function createScheduleFilterPath(
  search: string,
  name: "enabled" | "scheduleType",
  value: string | null,
) {
  const parameters = new URLSearchParams(search);

  parameters.delete("cursor");

  if (value) {
    parameters.set(name, value);
  } else {
    parameters.delete(name);
  }

  return createScheduleListPath(parameters);
}

function scheduleFilterClass(isActive: boolean) {
  return isActive
    ? "rounded-md bg-black px-3 py-2 text-xs font-medium text-white"
    : "rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-900";
}

function createScheduleListPath(parameters: URLSearchParams) {
  const query = parameters.toString();

  return query ? `/schedules?${query}` : "/schedules";
}
