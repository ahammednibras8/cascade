import { isDevDashboardAuthEnabled } from "~/lib/auth/dashboard-auth-mode.server";
import { getOidcConfiguration } from "~/lib/auth/oidc-config.server";

export function loader() {
  const devAuthEnabled = isDevDashboardAuthEnabled();

  if (!devAuthEnabled) {
    getOidcConfiguration();
  }

  return Response.json(
    {
      ok: true,
      service: "@cascade/dashboard",
      authMode: devAuthEnabled ? "dev" : "oidc",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
