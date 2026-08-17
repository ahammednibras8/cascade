import { destroyDashboardSession } from "~/lib/dashboard-session.server";
import type { Route } from "./+types/logout";
import { redirect } from "react-router";

export async function action({ request }: Route.ActionArgs) {
  const setCookie = await destroyDashboardSession(request);

  return redirect("/signed-out", {
    headers: {
      "Set-Cookie": setCookie,
    },
  });
}
