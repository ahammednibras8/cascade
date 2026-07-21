import type { Route } from "./+types/runs";

export function meta() {
  return [{ title: "Runs | Cascade" }];
}

export async function loader() {
  const { prisma } = await import("@cascade/database");

  const runs = await prisma.taskRun.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
    select: {
      id: true,
      status: true,
      createdAt: true,
      startedAt: true,
      lastHeartbeatAt: true,
      completedAt: true,
      task: {
        select: {
          slug: true,
          name: true,
          environment: {
            select: {
              slug: true,
              project: {
                select: {
                  slug: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          attempts: true,
          events: true,
        },
      },
    },
  });

  return {
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      taskSlug: run.task.slug,
      taskName: run.task.name,
      environmentSlug: run.task.environment.slug,
      projectSlug: run.task.environment.project.slug,
      projectName: run.task.environment.project.name,
      attemptsCount: run._count.attempts,
      eventsCount: run._count.events,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
    })),
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

function getStatusClassName(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-green-100 text-green-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "EXECUTING":
      return "bg-yellow-100 text-yellow-800";
    case "PENDING":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function Runs({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <p className="text-sm text-gray-500">Cascade</p>
        <h1 className="text-3xl font-semibold tracking-tight">Task runs</h1>
        <p className="mt-2 text-gray-600">Latest durable task runs from Postgres</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Run</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Task</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Project</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Attempts</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Events</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Completed</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loaderData.runs.map((run) => (
              <tr key={run.id}>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{run.id}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusClassName(
                      run.status,
                    )}`}
                  >
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{run.taskName}</div>
                  <div className="text-xs text-gray-500">{run.taskSlug}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{run.projectName}</div>
                  <div className="text-xs text-gray-500">
                    {run.projectSlug}/{run.environmentSlug}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{run.attemptsCount}</td>
                <td className="px-4 py-3 text-gray-700">{run.eventsCount}</td>
                <td className="px-4 py-3 text-gray-700">{formatDate(run.createdAt)}</td>
                <td className="px-4 py-3 text-gray-700">{formatDate(run.completedAt)}</td>
              </tr>
            ))}

            {loaderData.runs.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>
                  No task runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
