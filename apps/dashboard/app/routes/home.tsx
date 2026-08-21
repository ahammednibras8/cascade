import { Form, Link } from "react-router";
import type { Route } from "./+types/home";
import { ArrowRight } from "~/components/icons";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";
import { getDashboardWorkspaceContext } from "~/lib/workspace/dashboard-workspace.server";
import { hasDashboardCapability } from "~/lib/auth/dashboard-permissions";

type HomeData = Route.ComponentProps["loaderData"];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireDashboardUser(request);

  return getDashboardWorkspaceContext(request, session.userId);
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
      <HomeHeader />
      <ActiveOrganizationSection data={loaderData} />
      <ActiveWorkspaceSection data={loaderData} />
      <HomeActions data={loaderData} />
    </main>
  );
}

function HomeHeader() {
  return (
    <>
      <p className="text-sm text-gray-500">Cascade</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-3 text-gray-600">Inspect registered tasks and durable task runs.</p>
    </>
  );
}

function ActiveOrganizationSection({ data }: { data: HomeData }) {
  return (
    <section
      aria-labelledby="active-organization-heading"
      className="mt-6 rounded-md border border-gray-200 bg-white p-4"
    >
      <p id="active-organization-heading" className="text-sm font-medium text-gray-900">
        Active organization
      </p>
      {data.activeOrganization ? (
        <OrganizationSwitcher data={data} />
      ) : (
        <p className="mt-1 text-sm text-red-700">
          Your account is not a member of an organization.
        </p>
      )}
    </section>
  );
}

function OrganizationSwitcher({ data }: { data: HomeData }) {
  if (!data.activeOrganization) {
    return null;
  }

  return (
    <>
      <p className="mt-1 text-sm text-gray-600">
        Active organization: {data.activeOrganization.name}
      </p>
      <Form method="post" action="/organizations/select" className="mt-3 flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Organization
          <select
            name="organizationId"
            defaultValue={data.activeOrganization.id}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {data.organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} ({organization.role.toLowerCase()})
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="returnTo" value="/" />
        <SwitchButton label="Switch organization" />
      </Form>
    </>
  );
}

function ActiveWorkspaceSection({ data }: { data: HomeData }) {
  return (
    <section
      aria-labelledby="active-workspace-heading"
      className="mt-4 rounded-md border border-gray-200 bg-white p-4"
    >
      <p id="active-workspace-heading" className="text-sm font-medium text-gray-900">
        Active project and environment
      </p>
      {data.activeProject && data.activeEnvironment ? (
        <WorkspaceSwitcher data={data} />
      ) : (
        <p className="mt-1 text-sm text-amber-700">
          This organization has no projects with environments yet.
        </p>
      )}
    </section>
  );
}

function WorkspaceSwitcher({ data }: { data: HomeData }) {
  if (!data.activeProject || !data.activeEnvironment) {
    return null;
  }

  return (
    <>
      <p className="mt-1 text-sm text-gray-600">Active project: {data.activeProject.name}</p>
      <p className="mt-1 text-sm text-gray-600">
        Active environment: {data.activeEnvironment.name}
      </p>
      <Form method="post" action="/workspace/select" className="mt-3 flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Project and environment
          <select
            name="environmentId"
            defaultValue={data.activeEnvironment.id}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {data.projects.map((project) => (
              <optgroup key={project.id} label={project.name}>
                {project.environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name} ({environment.type.toLowerCase()})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <input type="hidden" name="returnTo" value="/" />
        <SwitchButton label="Switch workspace" />
      </Form>
    </>
  );
}

function SwitchButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
    >
      {label}
    </button>
  );
}

function HomeActions({ data }: { data: HomeData }) {
  return (
    <div className="mt-6 flex gap-3">
      <HomeLink to="/tasks" label="View tasks" primary />
      <HomeLink to="/deployments" label="View deployments" />
      <HomeLink to="/schedules" label="View schedules" />
      <HomeLink to="/runs" label="View task runs" />
      {hasDashboardCapability(data.activeOrganization?.role, "API_KEYS_MANAGE") ? (
        <HomeLink to="/api-keys" label="Manage API keys" />
      ) : null}
      <SignOutForm />
    </div>
  );
}

function HomeLink({
  to,
  label,
  primary = false,
}: {
  to: string;
  label: string;
  primary?: boolean;
}) {
  const className = primary
    ? "inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
    : "inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900";

  return (
    <Link to={to} className={className}>
      {label}
      <ArrowRight size={15} />
    </Link>
  );
}

function SignOutForm() {
  return (
    <Form method="post" action="/logout">
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
      >
        Sign out
      </button>
    </Form>
  );
}
