import type { Route } from "./+types/run-detail";
import { Link } from "react-router";

export function meta() {
  return [{ title: "Run detail | Cascade" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const { prisma } = await import("@cascade/database");

  const run = await prisma.taskRun.findUnique({
    where: {
      id: params.runId,
    },
    select: {
      id: true,
      status: true,
      payload: true,
      output: true,
      error: true,
      idempotencyKeyHash: true,
      idempotencyRequestHash: true,
      startedAt: true,
      lastHeartbeatAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      task: {
        select: {
          id: true,
          slug: true,
          name: true,
          environment: {
            select: {
              id: true,
              slug: true,
              name: true,
              project: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      attempts: {
        orderBy: {
          attemptNumber: "asc",
        },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          error: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      },
      events: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          taskAttemptId: true,
          type: true,
          level: true,
          message: true,
          data: true,
          createdAt: true,
        },
      },
    },
  });

  if (!run) {
    throw new Response("Run not found", {
      status: 404,
    });
  }

  return {
    run: {
      ...run,
      startedAt: run.startedAt?.toISOString() ?? null,
      lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      attempts: run.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        error: attempt.error,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        completedAt: attempt.completedAt?.toISOString() ?? null,
        createdAt: attempt.createdAt.toISOString(),
      })),
      events: run.events.map((event) => ({
        id: event.id,
        taskAttemptId: event.taskAttemptId,
        type: event.type,
        level: event.level,
        message: event.message,
        data: event.data,
        createdAt: event.createdAt.toISOString(),
      })),
    },
  };
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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto rounded-md bg-gray-950 p-4 text-xs text-gray-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    {
      COMPLETED: "bg-green-100 text-green-800",
      FAILED: "bg-red-100 text-red-800",
      EXECUTING: "bg-yellow-100 text-yellow-800",
      PENDING: "bg-blue-100 text-blue-800",
    }[status] ?? "bg-gray-100 text-gray-800";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{status}</span>
  );
}

export default function RunDetail({ loaderData }: Route.ComponentProps) {
  const { run } = loaderData;

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/runs" className="text-sm text-gray-500 hover:text-gray-900">
          Back to runs
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Run detail</h1>
          <StatusBadge status={run.status} />
        </div>

        <p className="mt-2 font-mono text-sm text-gray-500">{run.id}</p>
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
