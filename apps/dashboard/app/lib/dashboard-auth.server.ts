import { redirect } from "react-router";
import { getDashboardSession, type DashboardSessionIdentity } from "./dashboard-session.server";

export async function requireDashboardUser(request: Request): Promise<DashboardSessionIdentity> {
  const session = await getDashboardSession(request);

  if (session) {
    return session;
  }

  const url = new URL(request.url);
  const returnTo = `${url.pathname}${url.search}`;

  throw redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}
