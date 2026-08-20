import { cascadeDashboardApiStreamRequest } from "~/lib/api/cascade-api.server";
import type { Route } from "./+types/run-event-stream";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "connection",
  "content-type",
  "x-accel-buffering",
];

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const runId = params.runId;

  const upstream = await cascadeDashboardApiStreamRequest(
    request,
    `/api/runs/${encodeURIComponent(runId)}/events/stream`,
    {
      headers: {
        "Last-Event-ID": request.headers.get("Last-Event-ID") ?? "",
      },
    },
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
