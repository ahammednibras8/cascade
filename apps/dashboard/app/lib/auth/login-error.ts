const DASHBOARD_LOGIN_ERROR_CODES = [
  "sign_in_cancelled",
  "sign_in_expired",
  "invalid_identity",
  "email_not_verified",
  "provider_unavailable",
  "identity_link_required",
  "authentication_failed",
] as const;

export type DashboardLoginErrorCode = (typeof DASHBOARD_LOGIN_ERROR_CODES)[number];

const DASHBOARD_LOGIN_ERROR_MESSAGES = {
  sign_in_cancelled: "Sign-in was cancelled. You can try again when you are ready.",
  sign_in_expired: "Your sign-in attempt expired. Please start again.",
  invalid_identity: "We could not verify the identity returned by your provider.",
  email_not_verified:
    "Your identity provider must verify your email address before you can sign in.",
  provider_unavailable: "The sign-in provider is temporarily unavailable. Please try again.",
  identity_link_required:
    "This email is already linked to another sign-in identity. Use the originally linked provider.",
  authentication_failed: "Authentication failed. Please try again.",
} satisfies Record<DashboardLoginErrorCode, string>;

export function getDashboardLoginErrorMessage(value: unknown) {
  if (typeof value !== "string" || !DASHBOARD_LOGIN_ERROR_CODES.some((code) => code === value)) {
    return null;
  }

  return DASHBOARD_LOGIN_ERROR_MESSAGES[value as DashboardLoginErrorCode];
}
