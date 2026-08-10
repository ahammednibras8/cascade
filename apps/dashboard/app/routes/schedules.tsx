import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/schedules";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

type Schedule = {
  id: string;
  taskId: string;
  name: string;
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  enabled: boolean;
  hasPayload: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  task: {
    id: string;
    slug: string;
    name: string;
    deployment: {
      id: string;
      version: string;
      status: string;
    } | null;
  };
};

export function meta() {
  return [{ title: "Schedules | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    schedules: Schedule[];
  }>("/api/schedules");

  return {
    schedules: response.schedules,
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const scheduleId = formData.get("scheduleId");

  if (
    typeof scheduleId !== "string" ||
    (intent !== "pause" && intent !== "resume" && intent !== "delete")
  ) {
    throw new Response("Invalid schedule action", {
      status: 400,
    });
  }

  const encodedScheduleId = encodeURIComponent(scheduleId);

  const path =
    intent === "pause"
      ? `/api/schedules/${encodedScheduleId}/pause`
      : intent === "resume"
        ? `/api/schedules/${encodedScheduleId}/resume`
        : `/api/schedules/${encodedScheduleId}`;

  const method = intent === "delete" ? "DELETE" : "POST";

  try {
    await cascadeApiRequest(path, {
      method,
    });

    return {
      ok: true,
      intent,
      scheduleId,
    };
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    throw new Response("Could not update schedule", {
      status,
    });
  }
}

function formatRule(schedule: Schedule) {
  if (schedule.scheduleType === "INTERVAL") {
    return `Every ${schedule.intervalSeconds} seconds`;
  }

  return `${schedule.cronExpression} (${schedule.timezone})`;
}

export default function Schedules({ loaderData }: Route.ComponentProps) {
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">Schedule</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Task</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Rule</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Next run</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Last run</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">State</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loaderData.schedules.map((schedule) => (
              <tr key={schedule.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{schedule.name}</div>
                  <div className="font-mono text-xs text-gray-500">{schedule.id}</div>

                  {schedule.hasPayload ? (
                    <div className="mt-1 text-xs text-gray-500">Has payload</div>
                  ) : null}
                </td>

                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{schedule.task.name}</div>
                  <div className="font-mono text-xs text-gray-500">{schedule.task.slug}</div>
                </td>

                <td className="px-4 py-3 font-mono text-xs text-gray-700">
                  {formatRule(schedule)}
                </td>

                <td className="px-4 py-3 text-gray-700">{formatDate(schedule.nextRunAt)}</td>

                <td className="px-4 py-3 text-gray-700">{formatDate(schedule.lastRunAt)}</td>

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
                  <div className="flex flex-wrap gap-2">
                    {schedule.enabled ? (
                      <Form method="post">
                        <input type="hidden" name="scheduleId" value={schedule.id} />
                        <button
                          type="submit"
                          name="intent"
                          value="pause"
                          disabled={submittingScheduleId === schedule.id}
                          className="rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {submittingScheduleId === schedule.id ? "Updating..." : "Pause schedule"}
                        </button>
                      </Form>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="scheduleId" value={schedule.id} />
                        <button
                          type="submit"
                          name="intent"
                          value="resume"
                          disabled={submittingScheduleId === schedule.id}
                          className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {submittingScheduleId === schedule.id ? "Updating..." : "Resume schedule"}
                        </button>
                      </Form>
                    )}

                    <Form method="post">
                      <input type="hidden" name="scheduleId" value={schedule.id} />
                      <button
                        type="submit"
                        name="intent"
                        value="delete"
                        disabled={submittingScheduleId === schedule.id}
                        onClick={(event) => {
                          if (!window.confirm(`Delete schedule "${schedule.name}"?`)) {
                            event.preventDefault();
                          }
                        }}
                        className="rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingScheduleId === schedule.id ? "Updating..." : "Delete schedule"}
                      </button>
                    </Form>
                  </div>
                </td>
              </tr>
            ))}

            {loaderData.schedules.length === 0 ? (
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
