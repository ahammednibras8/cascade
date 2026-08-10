import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/edit-schedule";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

type Schedule = {
  id: string;
  taskId: string;
  name: string;
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
  payload: unknown;
  task: {
    id: string;
    slug: string;
    name: string;
  };
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

function apiFailure(error: unknown) {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;

  const responseBody =
    typeof error === "object" && error !== null && "responseBody" in error
      ? error.responseBody
      : null;

  const apiError =
    typeof responseBody === "object" &&
    responseBody !== null &&
    "error" in responseBody &&
    typeof responseBody.error === "object" &&
    responseBody.error !== null
      ? responseBody.error
      : null;

  return {
    status,
    code:
      apiError && "code" in apiError && typeof apiError.code === "string"
        ? apiError.code
        : "UPDATE_SCHEDULE_FAILED",
    message:
      apiError && "message" in apiError && typeof apiError.message === "string"
        ? apiError.message
        : "Could not update schedule",
  };
}

function isObjectStorageRef(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "cascadeObjectRef" in value &&
    value.cascadeObjectRef === true
  );
}

export function meta() {
  return [{ title: "Edit schedule | Cascade" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const response = await cascadeApiRequest<{
    schedule: Schedule;
  }>(`/api/schedules/${encodeURIComponent(params.scheduleId)}`);

  return {
    schedule: response.schedule,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const scheduleType = formData.get("scheduleType");
  const name = formData.get("name");
  const payloadJson = formData.get("payloadJson");
  const clearPayload = formData.get("clearPayload") === "true";

  if (scheduleType !== "INTERVAL" && scheduleType !== "CRON") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_SCHEDULE_TYPE",
          message: "Select INTERVAL or CRON",
        },
      },
      { status: 400 },
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

  if (clearPayload) {
    body.payload = null;
  } else if (typeof payloadJson === "string" && payloadJson.trim()) {
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
        { status: 400 },
      );
    }
  }

  try {
    await cascadeApiRequest(`/api/schedules/${encodeURIComponent(params.scheduleId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return redirect("/schedules");
  } catch (error) {
    const failure = apiFailure(error);

    return Response.json(
      {
        ok: false,
        error: {
          code: failure.code,
          message: failure.message,
        },
      },
      { status: failure.status },
    );
  }
}

export default function EditSchedule({ loaderData }: Route.ComponentProps) {
  const { schedule } = loaderData;
  const [scheduleType, setScheduleType] = useState(schedule.scheduleType);
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const payloadIsStoredExternally = isObjectStorageRef(schedule.payload);

  const initialPayload =
    schedule.payload === null || payloadIsStoredExternally
      ? ""
      : JSON.stringify(schedule.payload, null, 2);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <Link to="/schedules" className="text-sm text-blue-700 hover:underline">
          Back to schedules
        </Link>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Edit schedule</h1>

        <p className="mt-2 text-gray-600">
          {schedule.task.name} <span className="font-mono text-sm">({schedule.task.slug})</span>
        </p>
      </div>

      <Form method="post" className="space-y-5 rounded-lg border border-gray-200 bg-white p-6">
        <label className="block">
          <span className="text-sm font-medium text-gray-800">Name</span>
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={schedule.name}
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
              defaultValue={schedule.intervalSeconds ?? 60}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Cron expression</span>
              <input
                name="cronExpression"
                required
                defaultValue={schedule.cronExpression ?? ""}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-800">Timezone</span>
              <input
                name="timezone"
                required
                defaultValue={schedule.timezone}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-800">Replacement payload JSON</span>
          <textarea
            name="payloadJson"
            rows={7}
            defaultValue={initialPayload}
            placeholder="Leave blank to keep the current payload"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </label>

        {payloadIsStoredExternally ? (
          <p className="text-sm text-amber-700">
            The current large payload is stored in RustFS. Leave the text area blank to preserve it,
            or enter replacement JSON.
          </p>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" name="clearPayload" value="true" />
          Clear the payload
        </label>

        {actionData?.ok === false ? (
          <p role="alert" className="text-sm text-red-700">
            {actionData.error.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save schedule"}
        </button>
      </Form>
    </main>
  );
}
