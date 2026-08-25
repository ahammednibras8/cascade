export type DashboardCapability =
  | "RUNS_MUTATE"
  | "SCHEDULES_MANAGE"
  | "DEPLOYMENTS_MANAGE"
  | "API_KEYS_MANAGE";

export type DashboardRole = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";

const capabilityRoles: Record<DashboardCapability, DashboardRole[]> = {
  RUNS_MUTATE: ["OWNER", "ADMIN", "DEVELOPER"],
  SCHEDULES_MANAGE: ["OWNER", "ADMIN", "DEVELOPER"],
  DEPLOYMENTS_MANAGE: ["OWNER", "ADMIN", "DEVELOPER"],
  API_KEYS_MANAGE: ["OWNER", "ADMIN"],
};

export function hasDashboardCapability(
  role: DashboardRole | null | undefined,
  capability: DashboardCapability,
) {
  return role ? capabilityRoles[capability].includes(role) : false;
}
