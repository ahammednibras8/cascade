import { prisma } from "@cascade/database";
import { createCookie } from "react-router";

export type DashboardOrganization = {
  id: string;
  slug: string;
  name: string;
  role: "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";
};

function getDashboardSessionSecret() {
  const secret = process.env.DASHBOARD_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be at least 32 characters");
  }

  return secret;
}

function getActiveOrganizationCookie() {
  const production = process.env.NODE_ENV === "production";

  return createCookie(
    production ? "__Host-cascade-active-organization" : "cascade-active-organization",
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

export async function getDashboardOrganizations(userId: string): Promise<DashboardOrganization[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId,
    },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
    },
  });

  return memberships
    .map((membership) => ({
      id: membership.organization.id,
      slug: membership.organization.slug,
      name: membership.organization.name,
      role: membership.role,
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export async function getDashboardOrganizationContext(request: Request, userId: string) {
  const organizations = await getDashboardOrganizations(userId);
  const selectedOrganizationId = await getActiveOrganizationCookie().parse(
    request.headers.get("Cookie"),
  );

  const activeOrganization =
    typeof selectedOrganizationId === "string"
      ? (organizations.find((organization) => organization.id === selectedOrganizationId) ??
        organizations[0] ??
        null)
      : (organizations[0] ?? null);

  return {
    organizations,
    activeOrganization,
  };
}

export async function commitActiveDashboardOrganization(organizationId: string) {
  return getActiveOrganizationCookie().serialize(organizationId);
}

export async function clearActiveDashboardOrganization() {
  return getActiveOrganizationCookie().serialize("", {
    maxAge: 0,
  });
}
