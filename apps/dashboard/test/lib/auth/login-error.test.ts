import { describe, expect, it } from "vitest";

const { getDashboardLoginErrorMessage } = await import("../../../app/lib/auth/login-error.js");

describe("dashboard login errors", () => {
  it.each([
    ["sign_in_cancelled", "Sign-in was cancelled. You can try again when you are ready."],
    ["sign_in_expired", "Your sign-in attempt expired. Please start again."],
    ["invalid_identity", "We could not verify the identity returned by your provider."],
    [
      "email_not_verified",
      "Your identity provider must verify your email address before you can sign in.",
    ],
    ["provider_unavailable", "The sign-in provider is temporarily unavailable. Please try again."],
    [
      "identity_link_required",
      "This email is already linked to another sign-in identity. Use the originally linked provider.",
    ],
    ["authentication_failed", "Authentication failed. Please try again."],
  ])("maps %s to its readable message", (code, message) => {
    expect(getDashboardLoginErrorMessage(code)).toBe(message);
  });

  it.each([
    undefined,
    null,
    "",
    "invalid_grant",
    "provider supplied description",
    { error: "authentication_failed" },
  ])("does not display the unknown value %j", (value) => {
    expect(getDashboardLoginErrorMessage(value)).toBeNull();
  });
});
