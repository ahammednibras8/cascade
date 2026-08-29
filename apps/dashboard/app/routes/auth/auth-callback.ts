import { clearOidcLoginTransaction, completeOidcLogin } from "~/lib/auth/oidc.server";
import type { Route } from "./+types/auth-callback";
import { findOrCreateOidcUser } from "~/lib/auth/dashboard-user.server";
import {
  commitDashboardSession,
  createDashboardSession,
} from "~/lib/auth/dashboard-session.server";
import { resolvePostAuthenticationRedirect } from "~/lib/auth/post-authentication.server";
import { redirect } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const login = await completeOidcLogin(request);
    const user = await findOrCreateOidcUser(login.profile);
    const session = await createDashboardSession(user.id);
    const sessionCookie = await commitDashboardSession(session.token);
    const destination = await resolvePostAuthenticationRedirect(user.id, login.returnTo);

    const headers = new Headers();
    headers.append("Set-Cookie", login.clearCookie);
    headers.append("Set-Cookie", sessionCookie);

    return redirect(destination, { headers });
  } catch {
    return redirect("/login?error=authentication_failed", {
      headers: {
        "Set-Cookie": await clearOidcLoginTransaction(),
      },
    });
  }
}
