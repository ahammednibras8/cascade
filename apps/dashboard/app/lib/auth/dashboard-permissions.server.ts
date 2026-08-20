import { requireDashboardUser } from "./dashboard-auth.server";
import { getDashboardWorkspaceContext } from "../workspace/dashboard-workspace.server";

type DashboardCapability =
  | "RUNS_MUTATE"
  | "SCHEDULES_MANAGE"
  | "DEPLOYMENTS_MANAGE"
  | "API_KEYS_MANAGE";

type DashboardRole = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";

const capabilityRoles: Record<DashboardCapability, DashboardRole[]> = {
  RUNS_MUTATE: ["OWNER", "ADMIN", "DEVELOPER"],
  SCHEDULES_MANAGE: ["OWNER", "ADMIN", "DEVELOPER"],
  DEPLOYMENTS_MANAGE: ["OWNER", "ADMIN", "DEVELOPER"],
  API_KEYS_MANAGE: ["OWNER", "ADMIN"],
};

export async function requireDashboardCapability(
  request: Request,
  capability: DashboardCapability,
) {
  const session = await requireDashboardUser(request);
  const workspace = await getDashboardWorkspaceContext(request, session.userId);
  const role = workspace.activeOrganization?.role;

  if (!role || !capabilityRoles[capability].includes(role)) {
    throw new Response("Forbidden", {
      status: 403,
    });
  }

  return {
    session,
    workspace,
  };
}
