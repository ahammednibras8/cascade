import { requireDashboardUser } from "~/lib/dashboard-auth.server";
import type { Route } from "./+types/select-organization";
import {
  commitActiveDashboardOrganization,
  getDashboardOrganizations,
} from "~/lib/dashboard-organization.server";
import { redirect } from "react-router";

function normalizeReturnTo(value: FormDataEntryValue | null) {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireDashboardUser(request);
  const formData = await request.formData();
  const organizationId = formData.get("organizationId");

  if (typeof organizationId !== "string" || !organizationId) {
    throw new Response("organizationId is required", {
      status: 400,
    });
  }

  const organizations = await getDashboardOrganizations(session.userId);
  const organization = organizations.find((candidate) => candidate.id === organizationId);

  if (!organization) {
    throw new Response("Organization is not available to this user", {
      status: 403,
    });
  }

  return redirect(normalizeReturnTo(formData.get("returnTo")), {
    headers: {
      "Set-Cookie": await commitActiveDashboardOrganization(organization.id),
    },
  });
}
