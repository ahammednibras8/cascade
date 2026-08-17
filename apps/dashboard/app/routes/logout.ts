import { destroyDashboardSession } from "~/lib/dashboard-session.server";
import type { Route } from "./+types/logout";
import { redirect } from "react-router";
import { clearActiveDashboardOrganization } from "~/lib/dashboard-organization.server";
import { clearActiveDashboardEnvironment } from "~/lib/dashboard-workspace.server";

export async function action({ request }: Route.ActionArgs) {
  const sessionCookie = await destroyDashboardSession(request);
  const organizationCookie = await clearActiveDashboardOrganization();

  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie);
  headers.append("Set-Cookie", organizationCookie);
  headers.append("Set-Cookie", await clearActiveDashboardEnvironment());

  return redirect("/signed-out", {
    headers,
  });
}
