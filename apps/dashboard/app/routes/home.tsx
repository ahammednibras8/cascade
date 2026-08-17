import { Form, Link } from "react-router";
import type { Route } from "./+types/home";
import { ArrowRight } from "~/components/icons";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";
import { getDashboardOrganizationContext } from "~/lib/dashboard-organization.server";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireDashboardUser(request);

  return getDashboardOrganizationContext(request, session.userId);
}

export function meta() {
  return [
    { title: "Cascade Dashboard" },
    { name: "description", content: "Cascade task dashboard" },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="text-sm text-gray-500">Cascade</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Dashboard</h1>

      <p className="mt-3 text-gray-600">Inspect registered tasks and durable task runs.</p>

      <section
        aria-labelledby="active-organization-heading"
        className="mt-6 rounded-md border border-gray-200 bg-white p-4"
      >
        <p id="active-organization-heading" className="text-sm font-medium text-gray-900">
          Active organization
        </p>

        {loaderData.activeOrganization ? (
          <>
            <p className="mt-1 text-sm text-gray-600">
              Active organization: {loaderData.activeOrganization.name}
            </p>

            <Form
              method="post"
              action="/organizations/select"
              className="mt-3 flex items-end gap-3"
            >
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Organization
                <select
                  name="organizationId"
                  defaultValue={loaderData.activeOrganization.id}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {loaderData.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name} ({organization.role.toLowerCase()})
                    </option>
                  ))}
                </select>
              </label>

              <input type="hidden" name="returnTo" value="/" />

              <button
                type="submit"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
              >
                Switch organization
              </button>
            </Form>
          </>
        ) : (
          <p className="mt-1 text-sm text-red-700">
            Your account is not a member of an organization.
          </p>
        )}
      </section>

      <div className="mt-6 flex gap-3">
        <Link
          to="/tasks"
          className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          View tasks
          <ArrowRight size={15} />
        </Link>

        <Link
          to="/deployments"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          View deployments
          <ArrowRight size={15} />
        </Link>

        <Link
          to="/schedules"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          View schedules
          <ArrowRight size={15} />
        </Link>

        <Link
          to="/runs"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          View task runs
          <ArrowRight size={15} />
        </Link>

        <Link
          to="/api-keys"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          Manage API keys
          <ArrowRight size={15} />
        </Link>

        <Form method="post" action="/logout">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
          >
            Sign out
          </button>
        </Form>
      </div>
    </main>
  );
}
