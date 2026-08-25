import { createCookie } from "react-router";
import { getDashboardOrganizationContext } from "./dashboard-organization.server";
import { prisma } from "@cascade/database";

function getDashboardSessionSecret() {
  const secret = process.env["DASHBOARD_SESSION_SECRET"];

  if (!secret || secret.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be atleast 32 characters");
  }

  return secret;
}

function getActiveEnvironmentCookie() {
  const production = process.env["NODE_ENV"] === "production";

  return createCookie(
    production ? "__Host-cascade-active-environment" : "cascade-active-environment",
    {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: production,
      secrets: [getDashboardSessionSecret()],
      maxAge: 60 * 60 * 24 * 7,
    },
  );
}

export async function getDashboardWorkspaceContext(request: Request, userId: string) {
  const organizationContext = await getDashboardOrganizationContext(request, userId);

  if (!organizationContext.activeOrganization) {
    return {
      ...organizationContext,
      projects: [],
      activeProject: null,
      activeEnvironment: null,
    };
  }

  const projects = await prisma.project.findMany({
    where: {
      organizationId: organizationContext.activeOrganization.id,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      environments: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
        },
        orderBy: {
          name: "asc",
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const selectedEnvironmentId = await getActiveEnvironmentCookie().parse(
    request.headers.get("Cookie"),
  );

  const environments = projects.flatMap((project) =>
    project.environments.map((environment) => ({
      ...environment,
      projectId: project.id,
    })),
  );

  const activeEnvironment =
    typeof selectedEnvironmentId === "string"
      ? (environments.find((environment) => environment.id === selectedEnvironmentId) ??
        environments[0] ??
        null)
      : (environments[0] ?? null);

  const activeProject = activeEnvironment
    ? (projects.find((project) => project.id === activeEnvironment.projectId) ?? null)
    : (projects[0] ?? null);

  return {
    ...organizationContext,
    projects,
    activeProject,
    activeEnvironment: activeEnvironment
      ? {
          id: activeEnvironment.id,
          slug: activeEnvironment.slug,
          name: activeEnvironment.name,
          type: activeEnvironment.type,
        }
      : null,
  };
}

export async function commitActiveDashboardEnvironment(environmentId: string) {
  return getActiveEnvironmentCookie().serialize(environmentId);
}

export async function clearActiveDashboardEnvironment() {
  return getActiveEnvironmentCookie().serialize("", {
    maxAge: 0,
  });
}
