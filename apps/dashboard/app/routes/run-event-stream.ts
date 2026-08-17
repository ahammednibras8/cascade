import { cascadeApiStreamRequest } from "~/lib/cascade-api.server";
import type { Route } from "./+types/run-event-stream";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "connection",
  "content-type",
  "x-accel-buffering",
];

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const runId = params.runId;

  const lastEventId = request.headers.get("Last-Event-ID");
  const init: RequestInit = lastEventId
    ? {
        headers: {
          "Last-Event-ID": lastEventId,
        },
      }
    : {};

  const upstream = await cascadeApiStreamRequest(
    `/api/runs/${encodeURIComponent(runId)}/events/stream`,
    init,
  );

  const headers = new Headers();

  for (const headerName of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(headerName);

    if (value) {
      headers.set(headerName, value);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
