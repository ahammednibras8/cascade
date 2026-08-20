import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Form, Link, useNavigation, useRevalidator } from "react-router";
import { JsonBlock } from "~/components/json-block";
import { StatusBadge } from "~/components/status-badge";
import type { RunEventStreamState } from "~/lib/realtime/run-event-stream";
import { formatRunDate, runDetailStreamLabel } from "./format";
import type { TaskRunAttempt, TaskRunDetail, TaskRunEvent } from "./types";

type RunDetailViewProps = {
  run: TaskRunDetail;
};

export function RunNotFound({ runId }: { runId: string }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/runs" className="text-sm text-blue-700 hover:text-blue-900 hover:underline">
        Back to runs
      </Link>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Run not found</h1>
        <p className="mt-3 text-gray-600">
          Task run <span className="font-mono text-sm">{runId}</span> was not found in the current
          dashboard environment.
        </p>
      </section>
    </main>
  );
}

export function RunDetailView({ run }: RunDetailViewProps) {
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const [streamState, setStreamState] = useState<RunEventStreamState>("connecting");
  const revalidate = revalidator.revalidate;

  useEffect(() => {
    let stop: (() => void) | undefined;
    let canceled = false;

    void import("~/lib/realtime/run-event-stream").then(({ connectRunEventStream }) => {
      if (canceled) {
        return undefined;
      }

      stop = connectRunEventStream({
        runId: run.id,
        onRunEvent() {
          void revalidate();
        },
        onStateChange: setStreamState,
      });

      return undefined;
    });

    return () => {
      canceled = true;
      stop?.();
    };
  }, [revalidate, run.id]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <RunHeader run={run} isSubmitting={navigation.state === "submitting"} />
      <p className="mt-1 text-xs text-gray-500">
        {runDetailStreamLabel({ revalidatorState: revalidator.state, streamState })}
      </p>
      <RunSummary run={run} />
      <RunPayloads run={run} />
      <RunAttempts attempts={run.attempts} />
      <RunEvents events={run.events} />
    </main>
  );
}

function RunHeader({ run, isSubmitting }: { run: TaskRunDetail; isSubmitting: boolean }) {
  const canCancel = run.status === "PENDING" || run.status === "EXECUTING";
  const canReplay =
    run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELED";

  return (
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
          <RunActionButton intent="cancel" label="Cancel run" disabled={isSubmitting} />
        ) : null}
        {canReplay ? (
          <RunActionButton intent="replay" label="Replay run" disabled={isSubmitting} />
        ) : null}
      </div>
    </div>
  );
}

function RunActionButton({
  intent,
  label,
  disabled,
}: {
  intent: "cancel" | "replay";
  label: string;
  disabled: boolean;
}) {
  return (
    <Form method="post">
      <button
        type="submit"
        name="intent"
        value={intent}
        disabled={disabled}
        className={
          intent === "cancel"
            ? "rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            : "rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {disabled ? "Updating..." : label}
      </button>
    </Form>
  );
}

function RunSummary({ run }: RunDetailViewProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <SummaryCard title="Task">
        <p className="mt-2 text-sm text-gray-700">{run.task.name}</p>
        <p className="font-mono text-xs text-gray-500">{run.task.slug}</p>
      </SummaryCard>
      <SummaryCard title="Project">
        <p className="mt-2 text-sm text-gray-700">{run.task.environment.project.name}</p>
        <p className="font-mono text-xs text-gray-500">
          {run.task.environment.project.slug}/{run.task.environment.slug}
        </p>
      </SummaryCard>
      <SummaryCard title="Timing">
        <dl className="mt-2 space-y-1 text-sm">
          <TimingRow label="Created" value={run.createdAt} />
          <TimingRow label="Started" value={run.startedAt} />
          <TimingRow label="Heartbeat" value={run.lastHeartbeatAt} />
          <TimingRow label="Completed" value={run.completedAt} />
        </dl>
      </SummaryCard>
      <SummaryCard title="Trace">
        <p className="mt-2 font-mono text-xs text-gray-700">{run.traceId ?? "-"}</p>
        <p className="mt-1 font-mono text-xs text-gray-500">
          trigger span: {run.triggerSpanId ?? "-"}
        </p>
      </SummaryCard>
    </section>
  );
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function TimingRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{formatRunDate(value)}</dd>
    </div>
  );
}

function RunPayloads({ run }: RunDetailViewProps) {
  const payloadSections: Array<{ label: string; value: unknown }> = [
    { label: "Payload", value: run.payload },
    { label: "Output", value: run.output },
    { label: "Error", value: run.error },
  ];

  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-3">
      {payloadSections.map(({ label, value }) => (
        <div key={label}>
          <h2 className="mb-3 font-medium text-gray-900">{label}</h2>
          <JsonBlock value={value} />
        </div>
      ))}
    </section>
  );
}

function RunAttempts({ attempts }: { attempts: TaskRunAttempt[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">Attempts</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Attempt", "Status", "Started", "Completed", "Error"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {attempts.map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} />
            ))}
            {attempts.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>
                  No attempts yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttemptRow({ attempt }: { attempt: TaskRunAttempt }) {
  return (
    <tr>
      <td className="px-4 py-3 font-mono text-xs">{attempt.attemptNumber}</td>
      <td className="px-4 py-3">
        <StatusBadge status={attempt.status} />
      </td>
      <td className="px-4 py-3">{formatRunDate(attempt.startedAt)}</td>
      <td className="px-4 py-3">{formatRunDate(attempt.completedAt)}</td>
      <td className="px-4 py-3">
        <JsonBlock value={attempt.error} />
      </td>
    </tr>
  );
}

function RunEvents({ events }: { events: TaskRunEvent[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">Logs / Events</h2>
      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                {event.level}
              </span>
              <span className="font-mono text-xs text-gray-500">{event.type}</span>
              <span className="text-xs text-gray-500">{formatRunDate(event.createdAt)}</span>
            </div>
            {event.message ? <p className="mt-2 text-sm text-gray-900">{event.message}</p> : null}
            {event.data ? <JsonBlock value={event.data} /> : null}
          </div>
        ))}
        {events.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            No events yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}
