import { Link } from "react-router";
import { StatusBadge } from "~/components/status-badge";
import type { TaskDetail, TaskDetailSchedule, TaskExecutionConfig, TaskRecentRun } from "./types";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatScheduleRule(schedule: TaskDetailSchedule) {
  if (schedule.scheduleType === "CRON") {
    return `${schedule.cronExpression ?? "-"} (${schedule.timezone})`;
  }

  return `Every ${schedule.intervalSeconds ?? "-"} seconds`;
}

function executionConfigSummary(config: TaskExecutionConfig | null) {
  if (!config) {
    return "No execution configuration";
  }

  const timeout = config.timeoutMs === null ? "No timeout" : `${config.timeoutMs} ms`;
  const concurrency =
    config.queue.concurrencyLimit === null
      ? "No concurrency limit"
      : `Concurrency ${config.queue.concurrencyLimit}`;

  return [
    `Schema v${config.schemaVersion}`,
    `Timeout ${timeout}`,
    `Attempts ${config.retry.maxAttempts}`,
    `Delay ${config.retry.delayMs} ms`,
    config.retry.exponentialBackoff ? "Exponential backoff" : "Fixed retry delay",
    `Queue ${config.queue.name}`,
    concurrency,
  ].join(" · ");
}

function TaskNotFound({ taskId }: { taskId: string | undefined }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/tasks" className="text-sm text-blue-700 hover:text-blue-900 hover:underline">
        Back to tasks
      </Link>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Task not found</h1>
        <p className="mt-3 text-gray-600">
          Task <span className="font-mono text-sm">{taskId}</span> was not found in the current
          dashboard environment.
        </p>
      </section>
    </main>
  );
}

function DetailCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-gray-900">{label}</h2>
      <div className="mt-2 text-sm text-gray-700">{children}</div>
    </div>
  );
}

function TaskConfiguration({ task }: { task: TaskDetail }) {
  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold tracking-tight">Execution configuration</h2>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-700">{executionConfigSummary(task.executionConfig)}</p>
      </div>
    </section>
  );
}

function TaskDeployment({ task }: { task: TaskDetail }) {
  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold tracking-tight">Deployment</h2>

      {task.deployment ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/deployments/${task.deployment.id}`}
              className="font-mono text-sm text-blue-700 hover:text-blue-900 hover:underline"
            >
              {task.deployment.version}
            </Link>
            <StatusBadge status={task.deployment.status} />
            <StatusBadge status={task.deployment.runtimeStatus} />
          </div>

          <p className="mt-3 break-all font-mono text-xs text-gray-600">{task.deployment.image}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          This task is not attached to an active deployment.
        </div>
      )}
    </section>
  );
}

function ScheduleRow({ schedule }: { schedule: TaskDetailSchedule }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          to={`/schedules/${schedule.id}/edit`}
          className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
        >
          {schedule.name}
        </Link>
        {schedule.hasPayload ? <div className="mt-1 text-xs text-gray-500">Has payload</div> : null}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-gray-700">{formatScheduleRule(schedule)}</td>
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
    </tr>
  );
}

function TaskSchedules({ task }: { task: TaskDetail }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Schedules</h2>
          <p className="mt-1 text-sm text-gray-600">Schedules configured for this task.</p>
        </div>

        <Link
          to="/schedules/new"
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
        >
          New schedule
        </Link>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Schedule", "Rule", "Next run", "Last run", "State"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {task.schedules.map((schedule) => (
              <ScheduleRow key={schedule.id} schedule={schedule} />
            ))}

            {task.schedules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No schedules configured for this task.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentRunRow({ run }: { run: TaskRecentRun }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          to={`/runs/${run.id}`}
          className="font-mono text-xs text-blue-700 hover:text-blue-900 hover:underline"
        >
          {run.id}
        </Link>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-4 py-3 text-gray-700">{run.attemptsCount}</td>
      <td className="px-4 py-3 text-gray-700">{run.eventsCount}</td>
      <td className="px-4 py-3 text-gray-700">{formatDate(run.createdAt)}</td>
      <td className="px-4 py-3 text-gray-700">{formatDate(run.completedAt)}</td>
    </tr>
  );
}

function TaskRecentRuns({ task }: { task: TaskDetail }) {
  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold tracking-tight">Recent runs</h2>
      <p className="mt-1 text-sm text-gray-600">The latest 20 runs for this task.</p>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Run", "Status", "Attempts", "Events", "Created", "Completed"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {task.recentRuns.map((run) => (
              <RecentRunRow key={run.id} run={run} />
            ))}

            {task.recentRuns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No runs have been created for this task.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TaskDetailView({ task }: { task: TaskDetail }) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <Link to="/tasks" className="text-sm text-blue-700 hover:text-blue-900 hover:underline">
        Back to tasks
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{task.name}</h1>
        {task.deployment ? <StatusBadge status={task.deployment.status} /> : null}
      </div>

      <p className="mt-2 font-mono text-sm text-gray-500">{task.slug}</p>
      <p className="mt-1 font-mono text-xs text-gray-400">{task.id}</p>

      {task.description ? <p className="mt-4 text-gray-600">{task.description}</p> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <DetailCard label="Total runs">
          <span className="text-2xl font-semibold text-gray-900">{task.runsCount}</span>
        </DetailCard>

        <DetailCard label="Total schedules">
          <span className="text-2xl font-semibold text-gray-900">{task.schedulesCount}</span>
        </DetailCard>
      </section>

      <TaskConfiguration task={task} />
      <TaskDeployment task={task} />
      <TaskSchedules task={task} />
      <TaskRecentRuns task={task} />
    </main>
  );
}

export { TaskNotFound };
