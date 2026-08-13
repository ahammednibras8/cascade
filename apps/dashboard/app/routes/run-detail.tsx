import type { Route } from "./+types/run-detail";
import { Form, Link, useNavigation, useRevalidator } from "react-router";
import { useEffect, useState } from "react";
import { StatusBadge } from "~/components/status-badge";
import { cascadeApiRequest } from "~/lib/cascade-api.server";
import { connectRunEventStream, type RunEventStreamState } from "~/lib/run-event-stream.client";

export function meta() {
  return [{ title: "Run detail | Cascade" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const runId = params.runId;

  try {
    const runResponse = await cascadeApiRequest<{
      taskRun: {
        id: string;
        status: string;
        payload: unknown;
        output: unknown;
        error: unknown;
        traceId: string | null;
        triggerSpanId: string | null;
        startedAt: string | null;
        lastHeartbeatAt: string | null;
        completedAt: string | null;
        createdAt: string;
        updatedAt: string;
        task: {
          id: string;
          slug: string;
          name: string;
          environment: {
            id: string;
            slug: string;
            name: string;
            project: {
              id: string;
              slug: string;
              name: string;
            };
          };
        };
        attempts: Array<{
          id: string;
          attemptNumber: number;
          status: string;
          error: unknown;
          startedAt: string | null;
          completedAt: string | null;
          createdAt: string;
        }>;
      };
    }>(`/api/runs/${encodeURIComponent(runId)}`);
    const eventsResponse = await cascadeApiRequest<{
      events: Array<{
        id: string;
        taskAttemptId: string | null;
        type: string;
        level: string;
        message: string | null;
        data: unknown;
        createdAt: string;
        traceId: string | null;
        spanId: string | null;
        parentSpanId: string | null;
      }>;
    }>(`/api/runs/${encodeURIComponent(runId)}/events`);

    return {
      run: {
        ...runResponse.taskRun,
        events: eventsResponse.events,
      },
    };
  } catch (error) {
    if (isRunNotFoundError(error)) {
      return {
        run: null,
        runId,
      };
    }

    throw error;
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "cancel" && intent !== "replay") {
    throw new Response("Invalid action", {
      status: 400,
    });
  }

  const runId = encodeURIComponent(params.runId);

  const path = intent === "cancel" ? `/api/runs/${runId}/cancel` : `/api/runs/${runId}/replay`;

  try {
    return await cascadeApiRequest<{
      taskRun: {
        id: string;
        status: string;
      };
    }>(path, {
      method: "POST",
    });
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    throw new Response("Could not update task run", {
      status,
    });
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function isRunNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  const candidate = error as {
    status?: unknown;
    responseBody?: {
      error?: {
        code?: unknown;
      };
    };
  };

  return candidate.status === 404 && candidate.responseBody?.error?.code === "RUN_NOT_FOUND";
}

function isObjectStorageRef(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as {
    cascadeObjectRef?: unknown;
    kind?: unknown;
    bucket?: unknown;
    key?: unknown;
    byteSize?: unknown;
    sha256?: unknown;
  };

  return (
    candidate.cascadeObjectRef === true &&
    typeof candidate.kind === "string" &&
    typeof candidate.bucket === "string" &&
    typeof candidate.key === "string" &&
    typeof candidate.byteSize === "number" &&
    typeof candidate.sha256 === "string"
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (isObjectStorageRef(value)) {
    const ref = value as {
      kind: string;
      bucket: string;
      key: string;
      byteSize: number;
      sha256: string;
    };

    return (
      <div className="rounded-md bg-gray-950 p-4 text-xs text-gray-100">
        <p className="font-semibold">Large {ref.kind.toLowerCase()} stored in RustFS</p>
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-gray-400">Bucket</dt>
            <dd className="font-mono">{ref.bucket}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Key</dt>
            <dd className="break-all font-mono">{ref.key}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Size</dt>
            <dd>{ref.byteSize.toLocaleString()} bytes</dd>
          </div>
          <div>
            <dt className="text-gray-400">SHA256</dt>
            <dd className="break-all font-mono">{ref.sha256}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded-md bg-gray-950 p-4 text-xs text-gray-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function RunDetail({ loaderData }: Route.ComponentProps) {
  const { run } = loaderData;
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const [streamState, setStreamState] = useState<RunEventStreamState>("connecting");
  const revalidate = revalidator.revalidate;

  useEffect(() => {
    if (!run) {
      return;
    }

    return connectRunEventStream({
      runId: run.id,
      onRunEvent() {
        void revalidate();
      },
      onStateChange: setStreamState,
    });
  }, [revalidate, run?.id]);

  if (!run) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Link to="/runs" className="text-sm text-blue-700 hover:text-blue-900 hover:underline">
          Back to runs
        </Link>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Run not found</h1>
          <p className="mt-3 text-gray-600">
            Task run <span className="font-mono text-sm">{loaderData.runId}</span> was not found in
            the current dashboard environment.
          </p>
        </section>
      </main>
    );
  }

  const isSubmitting = navigation.state === "submitting";
  const canCancel = run.status === "PENDING" || run.status === "EXECUTING";
  const canReplay =
    run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELED";

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/runs" className="text-sm text-blue-700 hover:text-blue-900 hover:underline">
          Back to runs
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Run detail</h1>
          <StatusBadge status={run.status} />
        </div>

        <p className="mt-2 font-mono text-sm text-gray-500">{run.id}</p>
        <div className="mt-4 flex gap-2">
          {canCancel ? (
            <Form method="post">
              <button
                type="submit"
                name="intent"
                value="cancel"
                disabled={isSubmitting}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Updating..." : "Cancel run"}
              </button>
            </Form>
          ) : null}

          {canReplay ? (
            <Form method="post">
              <button
                type="submit"
                name="intent"
                value="replay"
                disabled={isSubmitting}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Updating..." : "Replay run"}
              </button>
            </Form>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {revalidator.state === "loading"
            ? "Refreshing..."
            : streamState === "connected"
              ? "Live updates connected"
              : streamState === "reconnecting"
                ? "Reconnecting live updates..."
                : "Connecting live updates..."}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Task</h2>
          <p className="mt-2 text-sm text-gray-700">{run.task.name}</p>
          <p className="font-mono text-xs text-gray-500">{run.task.slug}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Project</h2>
          <p className="mt-2 text-sm text-gray-700">{run.task.environment.project.name}</p>
          <p className="font-mono text-xs text-gray-500">
            {run.task.environment.project.slug}/{run.task.environment.slug}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Timing</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">{formatDate(run.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Started</dt>
              <dd className="text-gray-900">{formatDate(run.startedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Heartbeat</dt>
              <dd className="text-gray-900">{formatDate(run.lastHeartbeatAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Completed</dt>
              <dd className="text-gray-900">{formatDate(run.completedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Trace</h2>
          <p className="mt-2 font-mono text-xs text-gray-700">{run.traceId ?? "-"}</p>
          <p className="mt-1 font-mono text-xs text-gray-500">
            trigger span: {run.triggerSpanId ?? "-"}
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div>
          <h2 className="mb-3 font-medium text-gray-900">Payload</h2>
          <JsonBlock value={run.payload} />
        </div>

        <div>
          <h2 className="mb-2 font-medium text-gray-900">Output</h2>
          <JsonBlock value={run.output} />
        </div>

        <div>
          <h2 className="mb-2 font-medium text-gray-900">Error</h2>
          <JsonBlock value={run.error} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Attempts</h2>

        <div className="overflow-hidden rounded-lg border border-gray-200  bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Attempt</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Started</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Completed</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Error</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {run.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-4 py-3 font-mono text-xs">{attempt.attemptNumber}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={attempt.status} />
                  </td>
                  <td className="px-4 py-3">{formatDate(attempt.startedAt)}</td>
                  <td className="px-4 py-3">{formatDate(attempt.completedAt)}</td>
                  <td className="px-4 py-3">
                    <JsonBlock value={attempt.error} />
                  </td>
                </tr>
              ))}

              {run.attempts.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>
                    No attempts yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Logs / Events</h2>

        <div className="space-y-2">
          {run.events.map((event) => (
            <div key={event.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                  {event.level}
                </span>
                <span className="font-mono text-xs text-gray-500">{event.type}</span>
                <span className="text-xs text-gray-500">{formatDate(event.createdAt)}</span>
              </div>

              {event.message ? <p className="mt-2 text-sm text-gray-900">{event.message}</p> : null}

              {event.data ? (
                <div className="mt-3">
                  <JsonBlock value={event.data} />
                </div>
              ) : null}
            </div>
          ))}

          {run.events.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
              No events yet.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
