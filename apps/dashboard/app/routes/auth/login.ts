import { clearOidcLoginTransaction, startOidcLogin } from "~/lib/auth/oidc.server";
import type { Route } from "./+types/login";
import { redirect } from "react-router";
import { findOrCreateDevDashboardUser } from "~/lib/auth/dashboard-user.server";
import {
  commitDashboardSession,
  createDashboardSession,
} from "~/lib/auth/dashboard-session.server";
import { resolvePostAuthenticationRedirect } from "~/lib/auth/post-authentication.server";
import { isDevDashboardAuthEnabled } from "~/lib/auth/dashboard-auth-mode.server";
import { getDashboardLoginErrorCode } from "~/lib/auth/login-error.server";
import { getSafeDashboardReturnTo } from "~/lib/auth/return-to.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = getSafeDashboardReturnTo(url.searchParams.get("returnTo"));

  if (isDevDashboardAuthEnabled()) {
    const user = await findOrCreateDevDashboardUser();
    const session = await createDashboardSession(user.id);
    const destination = await resolvePostAuthenticationRedirect(user.id, returnTo);

    return redirect(destination, {
      headers: {
        "Set-Cookie": await commitDashboardSession(session.token),
      },
    });
  }

  try {
    const login = await startOidcLogin(returnTo);

    return redirect(login.authorizationUrl, {
      headers: {
        "Set-Cookie": login.setCookie,
      },
    });
  } catch (error) {
    const searchParams = new URLSearchParams({
      error: getDashboardLoginErrorCode(error),
      returnTo,
    });

    return redirect(`/login?${searchParams.toString()}`, {
      headers: {
        "Set-Cookie": await clearOidcLoginTransaction(),
      },
    });
  }
}
