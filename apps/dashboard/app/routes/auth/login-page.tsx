import AuthEntryPage from "~/components/auth/AuthEntryPage";
import {
  commitDashboardSession,
  createDashboardSession,
  getDashboardSession,
} from "~/lib/auth/dashboard-session.server";
import { findOrCreateDevDashboardUser } from "~/lib/auth/dashboard-user.server";
import { resolveDashboardActivationState } from "~/lib/activation/activation-state.server";
import type { Route } from "./+types/login-page";
import { redirect } from "react-router";
import { createPersonalWorkspace } from "~/lib/auth/create-personal-workspace.server";
import { commitActiveDashboardOrganization } from "~/lib/workspace/dashboard-organization.server";
import { commitActiveDashboardEnvironment } from "~/lib/workspace/dashboard-workspace.server";

function normalizeReturnTo(value: string | null) {
  if (value?.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/dashboard";
}

function isDevAuthEnabled() {
  return process.env["DASHBOARD_AUTH_MODE"]?.trim() === "dev";
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = normalizeReturnTo(url.searchParams.get("returnTo"));
  const activationState = await resolveDashboardActivationState(request);

  if (activationState.state === "ACTIVATED") {
    throw redirect(returnTo);
  }

  if (activationState.state === "AUTH_REQUIRED") {
    return {
      activationState: null,
      authenticated: false,
      devAuthEnabled: isDevAuthEnabled(),
      error: url.searchParams.get("error"),
      returnTo,
      stage: "authentication" as const,
    };
  }

  if (activationState.state === "WORKSPACE_REQUIRED") {
    return {
      activationState: null,
      authenticated: true,
      devAuthEnabled: isDevAuthEnabled(),
      error: null,
      returnTo,
      stage: "workspace" as const,
    };
  }

  return {
    activationState,
    authenticated: true,
    devAuthEnabled: isDevAuthEnabled(),
    error: null,
    returnTo,
    stage: "activation" as const,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  if (formData.get("intent") === "create_workspace") {
    const session = await getDashboardSession(request);
    const projectName = formData.get("projectName");
    const returnToValue = formData.get("returnTo");

    if (!session) {
      throw redirect("/login");
    }

    if (typeof projectName !== "string" || !projectName.trim()) {
      return Response.json({ ok: false, error: "project_name_required" }, { status: 400 });
    }

    const workspace = await createPersonalWorkspace({
      userId: session.userId,
      projectName,
    });

    const headers = new Headers();
    headers.append("Set-Cookie", await commitActiveDashboardOrganization(workspace.organizationId));
    headers.append("Set-Cookie", await commitActiveDashboardEnvironment(workspace.environmentId));

    const returnTo = normalizeReturnTo(typeof returnToValue === "string" ? returnToValue : null);

    return redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`, {
      headers,
    });
  }

  if (formData.get("intent") !== "authenticate" || !isDevAuthEnabled()) {
    return Response.json({ ok: false, error: "authentication_unavailable" }, { status: 400 });
  }

  const existingSession = await getDashboardSession(request);

  if (existingSession) {
    return { ok: true, stage: "workspace" as const };
  }

  const user = await findOrCreateDevDashboardUser();
  const session = await createDashboardSession(user.id);

  return Response.json(
    { ok: true, stage: "workspace" as const },
    {
      headers: {
        "Set-Cookie": await commitDashboardSession(session.token),
      },
    },
  );
}

export function meta() {
  return [{ title: "Sign in · Cascade" }, { name: "description", content: "Sign in to Cascade." }];
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const startHref = `/auth/start?returnTo=${encodeURIComponent(loaderData.returnTo)}`;

  return (
    <AuthEntryPage
      activationState={loaderData.activationState}
      authenticated={loaderData.authenticated}
      devAuthEnabled={loaderData.devAuthEnabled}
      stage={loaderData.stage}
      startHref={startHref}
      returnTo={loaderData.returnTo}
      error={loaderData.error}
    />
  );
}
