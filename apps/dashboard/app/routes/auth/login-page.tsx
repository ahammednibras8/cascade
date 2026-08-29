import AuthEntryPage from "~/components/auth/AuthEntryPage";
import {
  commitDashboardSession,
  createDashboardSession,
  getDashboardSession,
} from "~/lib/auth/dashboard-session.server";
import { findOrCreateDevDashboardUser } from "~/lib/auth/dashboard-user.server";
import { hasUsableDashboardWorkspace } from "~/lib/auth/post-authentication.server";
import type { Route } from "./+types/login-page";
import { redirect } from "react-router";

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
  const session = await getDashboardSession(request);

  if (session) {
    if (await hasUsableDashboardWorkspace(session.userId)) {
      throw redirect(returnTo);
    }

    return {
      authenticated: true,
      devAuthEnabled: isDevAuthEnabled(),
      error: null,
      returnTo,
      stage: "workspace" as const,
    };
  }

  return {
    authenticated: false,
    devAuthEnabled: isDevAuthEnabled(),
    error: url.searchParams.get("error"),
    returnTo,
    stage: "authentication" as const,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

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
      authenticated={loaderData.authenticated}
      devAuthEnabled={loaderData.devAuthEnabled}
      stage={loaderData.stage}
      startHref={startHref}
      error={loaderData.error}
    />
  );
}
