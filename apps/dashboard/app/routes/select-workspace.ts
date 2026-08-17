import { requireDashboardUser } from "~/lib/dashboard-auth.server";
import type { Route } from "./+types/select-workspace";
import {
  commitActiveDashboardEnvironment,
  getDashboardWorkspaceContext,
} from "~/lib/dashboard-workspace.server";
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
  const environmentId = formData.get("environmentId");

  if (typeof environmentId !== "string" || !environmentId) {
    throw new Response("environmentId is required", {
      status: 400,
    });
  }

  const workspace = await getDashboardWorkspaceContext(request, session.userId);

  const environment = workspace.projects
    .flatMap((project) => project.environments)
    .find((candidate) => candidate.id === environmentId);

  if (!environment) {
    throw new Response("Environment is not available to this user", {
      status: 403,
    });
  }

  return redirect(normalizeReturnTo(formData.get("returnTo")), {
    headers: {
      "Set-Cookie": await commitActiveDashboardEnvironment(environment.id),
    },
  });
}
