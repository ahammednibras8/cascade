export const DASHBOARD_LOGIN_ERROR_CODES = [
  "sign_in_cancelled",
  "sign_in_expired",
  "invalid_identity",
  "email_not_verified",
  "provider_unavailable",
  "identity_link_required",
  "authentication_failed",
] as const;

export type DashboardLoginErrorCode = (typeof DASHBOARD_LOGIN_ERROR_CODES)[number];

export function isDashboardLoginErrorCode(value: unknown): value is DashboardLoginErrorCode {
  return typeof value === "string" && DASHBOARD_LOGIN_ERROR_CODES.some((code) => code === value);
}
