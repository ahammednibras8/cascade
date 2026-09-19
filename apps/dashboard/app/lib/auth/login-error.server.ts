import { OidcIdentityLinkRequiredError } from "./dashboard-user.server";
import type { DashboardLoginErrorCode } from "./login-error";
import { OidcAuthenticationError } from "./oidc.server";

export function getDashboardLoginErrorCode(error: unknown): DashboardLoginErrorCode {
  if (error instanceof OidcAuthenticationError) {
    return error.code;
  }

  if (error instanceof OidcIdentityLinkRequiredError) {
    return "identity_link_required";
  }

  return "authentication_failed";
}
