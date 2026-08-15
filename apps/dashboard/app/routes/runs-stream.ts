import { cascadeApiStreamRequest } from "~/lib/cascade-api.server";
import type { Route } from "./+types/runs-stream";

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "connection",
  "content-type",
  "x-accel-buffering",
];

export async function loader(_args: Route.LoaderArgs) {
  const upstream = await cascadeApiStreamRequest("/api/runs/stream");

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
