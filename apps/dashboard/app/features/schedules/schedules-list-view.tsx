import { Form, Link, useNavigation } from "react-router";
import { formatScheduleDate, formatScheduleRule } from "./format";
import type { Schedule } from "./types";

type SchedulesListViewProps = {
  schedules: Schedule[];
};

export function SchedulesListView({ schedules }: SchedulesListViewProps) {
  const navigation = useNavigation();
  const submittingScheduleId = navigation.formData?.get("scheduleId");

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          Back to dashboard
        </Link>
        <div className="mt-3 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Schedules</h1>
          <Link
            to="/schedules/new"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            New schedule
          </Link>
        </div>
        <p className="mt-2 text-gray-600">Task schedules in the current environment.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Schedule", "Task", "Rule", "Next run", "Last run", "State", "Actions"].map(
                (heading) => (
                  <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {schedules.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                schedule={schedule}
                isSubmitting={submittingScheduleId === schedule.id}
              />
            ))}
            {schedules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No schedules in this environment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function ScheduleRow({ schedule, isSubmitting }: { schedule: Schedule; isSubmitting: boolean }) {
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
      <td className="px-4 py-3">
        <ScheduleActions schedule={schedule} isSubmitting={isSubmitting} />
      </td>
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
