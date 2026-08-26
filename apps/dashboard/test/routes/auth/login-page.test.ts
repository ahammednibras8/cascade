import { describe, expect, it } from "vitest";
import { loader } from "../../../app/routes/auth/login-page.js";

describe("login page route", () => {
  it("preserves an internal return path", () => {
    const result = loader({
      request: new Request("http://dashboard.test/login?returnTo=/runs"),
    } as never);

    expect(result).toEqual({ error: null, returnTo: "/runs" });
  });

  it("rejects an external return path", () => {
    const result = loader({
      request: new Request("http://dashboard.test/login?returnTo=https://attacker.example.test"),
    } as never);

    expect(result).toEqual({ error: null, returnTo: "/dashboard" });
  });
});
