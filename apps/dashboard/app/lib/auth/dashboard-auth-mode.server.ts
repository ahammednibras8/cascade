export type DashboardAuthMode = "dev" | "oidc";

export function getDashboardAuthMode(): DashboardAuthMode {
  const mode = process.env["DASHBOARD_AUTH_MODE"]?.trim() || "oidc";

  if (mode !== "dev" && mode !== "oidc") {
    throw new Error("DASHBOARD_ATUH_MODE must be dev or oidc");
  }

  if (mode === "dev" && process.env["NODE_ENV"] === "production") {
    throw new Error("DASHBOARD_AUTH_MODE=dev cannot be used in production");
  }

  return mode;
}

export function isDevDashboardAuthEnabled() {
  return getDashboardAuthMode() === "dev";
}
