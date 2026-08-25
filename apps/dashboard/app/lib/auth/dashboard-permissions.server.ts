import { requireDashboardUser } from "./dashboard-auth.server";
import { getDashboardWorkspaceContext } from "../workspace/dashboard-workspace.server";
import { hasDashboardCapability, type DashboardCapability } from "./dashboard-permissions";

export async function requireDashboardCapability(
  request: Request,
  capability: DashboardCapability,
) {
  const session = await requireDashboardUser(request);
  const workspace = await getDashboardWorkspaceContext(request, session.userId);
  const role = workspace.activeOrganization?.role;

  if (!hasDashboardCapability(role, capability)) {
    throw new Response("Forbidden", {
      status: 403,
    });
  }

  return {
    session,
    workspace,
  };
}
