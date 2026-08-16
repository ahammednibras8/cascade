import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/deployment-detail";
import { StatusBadge } from "~/components/status-badge";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

type ExecutionConfig = {
  schemaVersion: number;
  timeoutMs: number | null;
  retry: {
    maxAttempts: number;
    delayMs: number;
    exponentialBackoff: boolean;
  };
  queue: {
    name: string;
    concurrencyLimit: number | null;
  };
};

type Deployment = {
  id: string;
  environmentId: string;
  version: string;
  image: string;
  status: string;
  runtimeStatus: string;
  runtimeError: string | null;
  runtimeStartedAt: string | null;
  runtimeStoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
  runsCount: number;
  tasks: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    executionConfig: ExecutionConfig | null;
    createdAt: string;
    updatedAt: string;
    runsCount: number;
    schedulesCount: number;
  }>;
};

export function meta() {
  return [{ title: "Deployment detail | Cascade" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const deploymentId = params.deploymentId;

  try {
    const response = await cascadeApiRequest<{
      deployment: Deployment;
    }>(`/api/deployments/${encodeURIComponent(deploymentId)}`);

    return {
      deployment: response.deployment,
      deploymentId,
    };
  } catch (error) {
    if (isDeploymentNotFoundError(error)) {
      return {
        deployment: null,
        deploymentId,
      };
    }

    throw error;
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "deactivate") {
    throw new Response("Invalid deployment action", {
      status: 400,
    });
  }

  try {
    const response = await cascadeApiRequest<{
      deployment: {
        id: string;
        status: "INACTIVE";
        tasksDetached: number;
        schedulesPaused: number;
      };
    }>(`/api/deployments/${encodeURIComponent(params.deploymentId)}/deactivate`, {
      method: "POST",
    });

    return {
      ok: true,
      deployment: response.deployment,
    };
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    throw new Response("Could not deactivate deployment", {
      status,
    });
  }
}

function isDeploymentNotFoundError(error: unknown) {
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

  return candidate.status === 404 && candidate.responseBody?.error?.code === "DEPLOYMENT_NOT_FOUND";
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

function executionConfigSummary(config: ExecutionConfig | null) {
  if (!config) {
    return "No execution configuration";
  }

  const timeout = config.timeoutMs === null ? "No timeout" : `${config.timeoutMs} ms`;
  const concurrency =
    config.queue.concurrencyLimit === null
      ? "No concurrency limit"
      : `Concurrency ${config.queue.concurrencyLimit}`;

  return [
    `Timeout ${timeout}`,
    `Attempts ${config.retry.maxAttempts}`,
    `Delay ${config.retry.delayMs} ms`,
    config.retry.exponentialBackoff ? "Exponential backoff" : "Fixed retry delay",
    `Queue ${config.queue.name}`,
    concurrency,
  ].join(" · ");
}

export default function DeploymentDetail({ loaderData }: Route.ComponentProps) {
  const { deployment } = loaderData;
  const navigation = useNavigation();

  if (!deployment) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Link
          to="/deployments"
          className="text-sm text-blue-700 hover:text-blue-900 hover:underline"
        >
          Back to deployments
        </Link>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Deployment not found</h1>
          <p className="mt-3 text-gray-600">
            Deployment <span className="font-mono text-sm">{loaderData.deploymentId}</span> was not
            found in the current dashboard environment.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link
          to="/deployments"
          className="text-sm text-blue-700 hover:text-blue-900 hover:underline"
        >
          Back to deployments
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Deployment detail</h1>
          <StatusBadge status={deployment.status} />
          <StatusBadge status={deployment.runtimeStatus} />
        </div>

        <p className="mt-2 font-mono text-sm text-gray-500">{deployment.id}</p>

        {deployment.status === "ACTIVE" ? (
          <div className="mt-4">
            <Form method="post">
              <button
                type="submit"
                name="intent"
                value="deactivate"
                disabled={
                  navigation.state === "submitting" &&
                  navigation.formData?.get("intent") === "deactivate"
                }
                onClick={(event) => {
                  const confirmed = window.confirm(
                    `Deactivate deployment "${deployment.version}"? This disables its tasks and pauses their enabled schedules. Existing runs will drain.`,
                  );

                  if (!confirmed) {
                    event.preventDefault();
                  }
                }}
                className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {navigation.state === "submitting" &&
                navigation.formData?.get("intent") === "deactivate"
                  ? "Deactivating..."
                  : "Deactivate deployment"}
              </button>
            </Form>

            <p className="mt-2 text-xs text-gray-500">
              New task triggers are disabled for this deployment. Existing task runs are allowed to
              drain.
            </p>
          </div>
        ) : null}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Version</h2>
          <p className="mt-2 font-mono text-sm text-gray-700">{deployment.version}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Image</h2>
          <p className="mt-2 break-all font-mono text-xs text-gray-700">{deployment.image}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Registered tasks</h2>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{deployment.tasks.length}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Task runs</h2>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{deployment.runsCount}</p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Runtime</h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Status</dt>
              <dd>
                <StatusBadge status={deployment.runtimeStatus} />
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Started</dt>
              <dd className="text-right text-gray-900">
                {formatDate(deployment.runtimeStartedAt)}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Stopped</dt>
              <dd className="text-right text-gray-900">
                {formatDate(deployment.runtimeStoppedAt)}
              </dd>
            </div>
          </dl>

          {deployment.runtimeError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">Runtime error</p>
              <p className="mt-1 wrap-break-word font-mono text-xs">{deployment.runtimeError}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-gray-900">Deployment timing</h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-right text-gray-900">{formatDate(deployment.createdAt)}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Updated</dt>
              <dd className="text-right text-gray-900">{formatDate(deployment.updatedAt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold tracking-tight">Tasks in this deployment</h2>
        <p className="mt-1 text-sm text-gray-600">
          The execution configuration shown here is the configuration registered by this deployment.
        </p>

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Task</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Execution</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Runs</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Schedules</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Updated</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {deployment.tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{task.name}</div>
                    <div className="font-mono text-xs text-gray-500">{task.slug}</div>

                    {task.description ? (
                      <p className="mt-1 text-xs text-gray-500">{task.description}</p>
                    ) : null}
                  </td>

                  <td className="max-w-xl px-4 py-3 text-xs text-gray-700">
                    {executionConfigSummary(task.executionConfig)}
                  </td>

                  <td className="px-4 py-3 text-gray-700">{task.runsCount}</td>

                  <td className="px-4 py-3 text-gray-700">{task.schedulesCount}</td>

                  <td className="px-4 py-3 text-gray-700">{formatDate(task.updatedAt)}</td>
                </tr>
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
    </main>
  );
}
