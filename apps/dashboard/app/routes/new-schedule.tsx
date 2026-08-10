import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/new-schedule";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

type Task = {
  id: string;
  slug: string;
  name: string;
};

type ActionData =
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    }
  | undefined;

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "responseBody" in error &&
    typeof error.responseBody === "object" &&
    error.responseBody !== null &&
    "error" in error.responseBody &&
    typeof error.responseBody.error === "object" &&
    error.responseBody.error !== null &&
    "message" in error.responseBody.error &&
    typeof error.responseBody.error.message === "string"
  ) {
    return error.responseBody.error.message;
  }

  return "Could not create schedule";
}

function getErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "responseBody" in error &&
    typeof error.responseBody === "object" &&
    error.responseBody !== null &&
    "error" in error.responseBody &&
    typeof error.responseBody.error === "object" &&
    error.responseBody.error !== null &&
    "code" in error.responseBody.error &&
    typeof error.responseBody.error.code === "string"
  ) {
    return error.responseBody.error.code;
  }

  return "CREATE_SCHEDULE_FAILED";
}

export function meta() {
  return [{ title: "New schedule | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    tasks: Task[];
  }>("/api/tasks");

  return {
    tasks: response.tasks,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  const taskId = formData.get("taskId");
  const scheduleType = formData.get("scheduleType");
  const name = formData.get("name");
  const payloadJson = formData.get("payloadJson");

  if (typeof taskId !== "string" || !taskId) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_TASK_ID",
          message: "Select a task",
        },
      },
      {
        status: 400,
      },
    );
  }

  if (scheduleType !== "INTERVAL" && scheduleType !== "CRON") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_SCHEDULE_TYPE",
          message: "Select INTERVAL or CRON",
        },
      },
      {
        status: 400,
      },
    );
  }

  const body: Record<string, unknown> = {
    scheduleType,
  };

  if (typeof name === "string" && name.trim()) {
    body.name = name.trim();
  }

  if (scheduleType === "INTERVAL") {
    body.intervalSeconds = Number(formData.get("intervalSeconds"));
  } else {
    body.cronExpression = formData.get("cronExpression");
    body.timezone = formData.get("timezone");
  }

  if (typeof payloadJson === "string" && payloadJson.trim()) {
    try {
      body.payload = JSON.parse(payloadJson);
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_PAYLOAD_JSON",
            message: "Payload must be valid JSON",
          },
        },
        {
          status: 400,
        },
      );
    }
  }

  try {
    await cascadeApiRequest(`/api/tasks/${encodeURIComponent(taskId)}/schedules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return redirect("/schedules");
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: {
          code: getErrorCode(error),
          message: getErrorMessage(error),
        },
      },
      {
        status:
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : 500,
      },
    );
  }
}

export default function NewSchedule({ loaderData }: Route.ComponentProps) {
  const [scheduleType, setScheduleType] = useState<"INTERVAL" | "CRON">("INTERVAL");
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <Link to="/schedules" className="text-sm text-blue-700 hover:underline">
          Back to schedules
        </Link>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight">New schedule</h1>

        <p className="mt-2 text-gray-600">
          Create an interval or cron schedule for a registered task.
        </p>
      </div>

      <Form method="post" className="space-y-5 rounded-lg border border-gray-200 bg-white p-6">
        <label className="block">
          <span className="text-sm font-medium text-gray-800">Task</span>
          <select
            name="taskId"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select a task</option>
            {loaderData.tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name} ({task.slug})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-800">Name</span>
          <input
            name="name"
            maxLength={200}
            placeholder="Weekday morning report"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-800">Schedule type</span>
          <select
            name="scheduleType"
            value={scheduleType}
            onChange={(event) => {
              setScheduleType(event.target.value as "INTERVAL" | "CRON");
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="INTERVAL">Interval</option>
            <option value="CRON">Cron</option>
          </select>
        </label>

        {scheduleType === "INTERVAL" ? (
          <label className="block">
            <span className="text-sm font-medium text-gray-800">Interval seconds</span>
            <input
              name="intervalSeconds"
              type="number"
              min={60}
              max={31_536_000}
              required
              defaultValue={60}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-gray-500">Minimum: 60 seconds.</span>
          </label>
        ) : (
          <>
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Cron expression</span>
              <input
                name="cronExpression"
                required
                placeholder="0 9 * * 1-5"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">
                Five fields: minute hour day-of-month month day-of-week.
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-800">Timezone</span>
              <input
                name="timezone"
                required
                defaultValue="UTC"
                placeholder="Asia/Kolkata"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-800">
            Payload JSON <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <textarea
            name="payloadJson"
            rows={6}
            placeholder={'{\n  "customerId": "customer-1"\n}'}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </label>

        {actionData?.ok === false ? (
          <p role="alert" className="text-sm text-red-700">
            {actionData.error.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || loaderData.tasks.length === 0}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating schedule..." : "Create schedule"}
        </button>

        {loaderData.tasks.length === 0 ? (
          <p className="text-sm text-amber-700">Register a task before creating a schedule.</p>
        ) : null}
      </Form>
    </main>
  );
}
