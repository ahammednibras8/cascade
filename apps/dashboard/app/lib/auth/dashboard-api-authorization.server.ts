import { createDashboardApiAuthorization } from "@cascade/core/dashboard-api-auth";
import { getDashboardSession } from "./dashboard-session.server";
import { getDashboardWorkspaceContext } from "../workspace/dashboard-workspace.server";

function getDashboardApiAuthSecret() {
  const secret = process.env.DASHBOARD_API_AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("DASHBOARD_API_AUTH_SECRET must be at least 32 characters");
  }

  return secret;
}

export async function createDashboardApiAuthorizationForRequest(request: Request) {
  const session = await getDashboardSession(request);

  if (!session) {
    throw new Error("Dashboard session is required");
  }

  const workspace = await getDashboardWorkspaceContext(request, session.userId);

  if (!workspace.activeOrganization || !workspace.activeProject || !workspace.activeEnvironment) {
    throw new Error("An active organization, project, and environment are required");
  }

  return createDashboardApiAuthorization(
    {
      userId: session.userId,
      organizationId: workspace.activeOrganization.id,
      projectId: workspace.activeProject.id,
      environmentId: workspace.activeEnvironment.id,
    },
    getDashboardApiAuthSecret(),
  );
}
