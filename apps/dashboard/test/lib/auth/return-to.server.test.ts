import { describe, expect, it } from "vitest";

const { getSafeDashboardReturnTo } = await import("../../../app/lib/auth/return-to.server.js");

describe("safe dashboard return paths", () => {
  it.each(["/dashboard", "/runs", "/runs?status=FAILED", "/runs/run-1#events"])(
    "preserves the internal destination %s",
    (destination) => {
      expect(getSafeDashboardReturnTo(destination)).toBe(destination);
    },
  );

  it.each([
    undefined,
    null,
    "",
    "runs",
    "https://attacker.example.test",
    "//attacker.example.test",
    "/\\attacker.example.test",
    { pathname: "/runs" },
  ])("replaces the unsafe destination %j", (destination) => {
    expect(getSafeDashboardReturnTo(destination)).toBe("/dashboard");
  });

  it("rejects a destination large enough to overflow the OIDC transaction cookie", () => {
    expect(getSafeDashboardReturnTo(`/${"a".repeat(2_048)}`)).toBe("/dashboard");
  });
});
