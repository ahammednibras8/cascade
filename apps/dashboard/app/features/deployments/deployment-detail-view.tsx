import { Link } from "react-router";
import type { ReactNode } from "react";
import { StatusBadge } from "~/components/status-badge";
import { DeploymentActions } from "./deployment-actions";
import { executionConfigSummary, formatDeploymentDate } from "./format";
import type { Deployment, DeploymentManifestTask, DeploymentTask } from "./types";

type DeploymentDetailViewProps = {
  deployment: Deployment;
};

type DeploymentNotFoundProps = {
  deploymentId: string;
};

function BackLink() {
  return (
    <Link to="/deployments" className="text-sm text-blue-700 hover:text-blue-900 hover:underline">
      Back to deployments
    </Link>
  );
}

function SummaryCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-gray-900">{label}</h2>
      <p
        className={
          mono
            ? "mt-2 break-all font-mono text-xs text-gray-700"
            : "mt-2 text-2xl font-semibold text-gray-900"
        }
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right text-gray-900">{children}</dd>
    </div>
  );
}

export function DeploymentNotFound({ deploymentId }: DeploymentNotFoundProps) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <BackLink />

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Deployment not found</h1>
        <p className="mt-3 text-gray-600">
          Deployment <span className="font-mono text-sm">{deploymentId}</span> was not found in the
          current dashboard environment.
        </p>
      </section>
    </main>
  );
}

function DeploymentHeader({ deployment }: DeploymentDetailViewProps) {
  return (
    <div className="mb-6">
      <BackLink />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Deployment detail</h1>
        <StatusBadge status={deployment.status} />
        <StatusBadge status={deployment.runtimeStatus} />
      </div>

      <p className="mt-2 font-mono text-sm text-gray-500">{deployment.id}</p>
      <DeploymentActions deployment={deployment} />
    </div>
  );
}

function RuntimePanel({ deployment }: DeploymentDetailViewProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-gray-900">Runtime</h2>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-gray-500">Status</dt>
          <dd>
            <StatusBadge status={deployment.runtimeStatus} />
          </dd>
        </div>
        <DetailRow label="Started">{formatDeploymentDate(deployment.runtimeStartedAt)}</DetailRow>
        <DetailRow label="Stopped">{formatDeploymentDate(deployment.runtimeStoppedAt)}</DetailRow>
      </dl>

      {deployment.runtimeError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Runtime error</p>
          <p className="mt-1 break-words font-mono text-xs">{deployment.runtimeError}</p>
        </div>
      ) : null}
    </div>
  );
}

function TimingPanel({ deployment }: DeploymentDetailViewProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-gray-900">Deployment timing</h2>

      <dl className="mt-3 space-y-2 text-sm">
        <DetailRow label="Created">{formatDeploymentDate(deployment.createdAt)}</DetailRow>
        <DetailRow label="Updated">{formatDeploymentDate(deployment.updatedAt)}</DetailRow>
      </dl>
    </div>
  );
}

function TaskRow({ task }: { task: DeploymentTask }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{task.name}</div>
        <div className="font-mono text-xs text-gray-500">{task.slug}</div>
        {task.description ? <p className="mt-1 text-xs text-gray-500">{task.description}</p> : null}
      </td>
      <td className="max-w-xl px-4 py-3 text-xs text-gray-700">
        {executionConfigSummary(task.executionConfig)}
      </td>
      <td className="px-4 py-3 text-gray-700">{task.runsCount}</td>
      <td className="px-4 py-3 text-gray-700">{task.schedulesCount}</td>
      <td className="px-4 py-3 text-gray-700">{formatDeploymentDate(task.updatedAt)}</td>
    </tr>
  );
}

function ManifestTaskRow({ task }: { task: DeploymentManifestTask }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{task.name}</div>
        <div className="font-mono text-xs text-gray-500">{task.slug}</div>

        {task.description ? <p className="mt-1 text-xs text-gray-500">{task.description}</p> : null}
      </td>

      <td className="max-w-xl px-4 py-3 text-xs text-gray-700">
        {executionConfigSummary(task.executionConfig)}
      </td>

      <td className="px-4 py-3 text-gray-700">{formatDeploymentDate(task.createdAt)}</td>
    </tr>
  );
}

function DeploymentTasksTable({ deployment }: DeploymentDetailViewProps) {
  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold tracking-tight">Tasks in this deployment</h2>
      <p className="mt-1 text-sm text-gray-600">
        The execution configuration shown here is the configuration registered by this deployment.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Task", "Execution", "Runs", "Schedules", "Updated"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {deployment.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
            {deployment.tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  This deployment has no registered tasks.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeploymentManifestTable({ deployment }: DeploymentDetailViewProps) {
  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold tracking-tight">Saved task manifest</h2>

      <p className="mt-1 text-sm text-gray-600">
        This task definition was saved when the deployment was created. Rollback uses this manifest
        even when the deployment has no currently registered tasks.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Task", "Execution", "Saved"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {deployment.manifestTasks.map((task) => (
              <ManifestTaskRow key={task.id} task={task} />
            ))}

            {deployment.manifestTasks.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  This deployment has no saved task manifest and cannot be rolled back.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DeploymentDetailView({ deployment }: DeploymentDetailViewProps) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <DeploymentHeader deployment={deployment} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Version" value={deployment.version} mono />
        <SummaryCard label="Image" value={deployment.image} mono />
        <SummaryCard label="Registered tasks" value={deployment.tasks.length} />
        <SummaryCard label="Task runs" value={deployment.runsCount} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <RuntimePanel deployment={deployment} />
        <TimingPanel deployment={deployment} />
      </section>

      <DeploymentTasksTable deployment={deployment} />
      <DeploymentManifestTable deployment={deployment} />
    </main>
  );
}
