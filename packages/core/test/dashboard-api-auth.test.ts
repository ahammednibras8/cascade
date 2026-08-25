import { describe, expect, it } from "vitest";
import {
  createDashboardApiAuthorization,
  verifyDashboardApiAuthorization,
} from "../src/dashboard-api-auth.js";

const SECRET = "test-dashboard-api-auth-secret-that-is-definitely-long-enough";

const claims = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  environmentId: "44444444-4444-4444-8444-444444444444",
};

const issuedAt = new Date("2026-08-17T12:00:00.000Z");
const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);

describe("dashboard API authorization", () => {
  it("creates and verifies a signed short-lived authorization token", () => {
    const token = createDashboardApiAuthorization(claims, SECRET, issuedAt);

    expect(verifyDashboardApiAuthorization(token, SECRET, issuedAt)).toEqual({
      ...claims,
      issuedAt: issuedAtSeconds,
      expiresAt: issuedAtSeconds + 60,
    });
  });

  it("rejects a token whose payload was modified", () => {
    const token = createDashboardApiAuthorization(claims, SECRET, issuedAt);

    const [version, payload, signature] = token.split(".");
    const alteredClaims = {
      ...JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")),
      environmentId: "55555555-5555-4555-8555-555555555555",
    };
    const alteredPayload = Buffer.from(JSON.stringify(alteredClaims)).toString("base64url");

    expect(
      verifyDashboardApiAuthorization(
        `${version}.${alteredPayload}.${signature}`,
        SECRET,
        issuedAt,
      ),
    ).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createDashboardApiAuthorization(claims, SECRET, issuedAt);

    expect(
      verifyDashboardApiAuthorization(token, SECRET, new Date("2026-08-17T12:01:01.000Z")),
    ).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = createDashboardApiAuthorization(claims, SECRET, issuedAt);

    expect(
      verifyDashboardApiAuthorization(
        token,
        "another-dashboard-api-auth-secret-that-is-long-enough",
        issuedAt,
      ),
    ).toBeNull();
  });
});
