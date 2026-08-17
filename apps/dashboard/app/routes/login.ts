import { startOidcLogin } from "~/lib/oidc.server";
import type { Route } from "./+types/login";
import { redirect } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const login = await startOidcLogin(url.searchParams.get("returnTo"));

  return redirect(login.authorizationUrl, {
    headers: {
      "Set-Cookie": login.setCookie,
    },
  });
}
