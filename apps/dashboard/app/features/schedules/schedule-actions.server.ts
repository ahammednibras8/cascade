import { redirect } from "react-router";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

type ScheduleActionIntent = "pause" | "resume" | "delete";

export async function handleScheduleListAction(formData: FormData) {
  const intent = formData.get("intent");
  const scheduleId = formData.get("scheduleId");

  if (
    typeof scheduleId !== "string" ||
    (intent !== "pause" && intent !== "resume" && intent !== "delete")
  ) {
    throw new Response("Invalid schedule action", { status: 400 });
  }

  try {
    await cascadeApiRequest(scheduleActionPath(scheduleId, intent), {
      method: intent === "delete" ? "DELETE" : "POST",
    });

    return { ok: true, intent, scheduleId };
  } catch (error) {
    throw new Response("Could not update schedule", { status: getErrorStatus(error) });
  }
}

export async function handleCreateSchedule(formData: FormData) {
  const taskId = formData.get("taskId");

  if (typeof taskId !== "string" || !taskId) {
    return jsonFailure(400, "INVALID_TASK_ID", "Select a task");
  }

  const body = parseScheduleRequestBody(formData, false);

  if (body instanceof Response) {
    return body;
  }

  try {
    await cascadeApiRequest(`/api/tasks/${encodeURIComponent(taskId)}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return redirect("/schedules");
  } catch (error) {
    return apiFailureResponse(error, "CREATE_SCHEDULE_FAILED", "Could not create schedule");
  }
}

export async function handleUpdateSchedule(scheduleId: string, formData: FormData) {
  const body = parseScheduleRequestBody(formData, formData.get("clearPayload") === "true");

  if (body instanceof Response) {
    return body;
  }

  try {
    await cascadeApiRequest(`/api/schedules/${encodeURIComponent(scheduleId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return redirect("/schedules");
  } catch (error) {
    return apiFailureResponse(error, "UPDATE_SCHEDULE_FAILED", "Could not update schedule");
  }
}

function parseScheduleRequestBody(formData: FormData, clearPayload: boolean) {
  const scheduleType = formData.get("scheduleType");
  const name = formData.get("name");
  const payloadJson = formData.get("payloadJson");

  if (scheduleType !== "INTERVAL" && scheduleType !== "CRON") {
    return jsonFailure(400, "INVALID_SCHEDULE_TYPE", "Select INTERVAL or CRON");
  }

  const body: Record<string, unknown> = { scheduleType };

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
      return jsonFailure(400, "INVALID_PAYLOAD_JSON", "Payload must be valid JSON");
    }
  }

  return body;
}

function scheduleActionPath(scheduleId: string, intent: ScheduleActionIntent) {
  const encodedScheduleId = encodeURIComponent(scheduleId);
  return intent === "pause"
    ? `/api/schedules/${encodedScheduleId}/pause`
    : intent === "resume"
      ? `/api/schedules/${encodedScheduleId}/resume`
      : `/api/schedules/${encodedScheduleId}`;
}

function apiFailureResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  const apiError = getApiError(error);

  return Response.json(
    {
      ok: false,
      error: {
        code: typeof apiError?.code === "string" ? apiError.code : fallbackCode,
        message: typeof apiError?.message === "string" ? apiError.message : fallbackMessage,
      },
    },
    { status: getErrorStatus(error) },
  );
}

function jsonFailure(status: number, code: string, message: string) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function getErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 500;
}

function getApiError(error: unknown) {
  const responseBody =
    typeof error === "object" && error !== null && "responseBody" in error
      ? error.responseBody
      : null;

  return typeof responseBody === "object" &&
    responseBody !== null &&
    "error" in responseBody &&
    typeof responseBody.error === "object" &&
    responseBody.error !== null
    ? (responseBody.error as { code?: unknown; message?: unknown })
    : null;
}
