import { startOidcLogin } from "~/lib/auth/oidc.server";
import type { Route } from "./+types/login";
import { redirect } from "react-router";
import { findOrCreateDevDashboardUser } from "~/lib/auth/dashboard-user.server";
import {
  commitDashboardSession,
  createDashboardSession,
} from "~/lib/auth/dashboard-session.server";

function isDevAuthEnabled() {
  return process.env.DASHBOARD_AUTH_MODE?.trim() === "dev";
}

function normalizeReturnTo(value: string | null) {
  if (value?.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");

  if (isDevAuthEnabled()) {
    const user = await findOrCreateDevDashboardUser();
    const session = await createDashboardSession(user.id);

    return redirect(normalizeReturnTo(returnTo), {
      headers: {
        "Set-Cookie": await commitDashboardSession(session.token),
      },
    });
  }

  const login = await startOidcLogin(returnTo);

  return redirect(login.authorizationUrl, {
    headers: {
      "Set-Cookie": login.setCookie,
    },
  });
}
