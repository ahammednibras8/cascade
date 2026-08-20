import { describe, expect, it } from "vitest";
import { hasDashboardCapability } from "../../../app/lib/auth/dashboard-permissions.js";

describe("hasDashboardCapability", () => {
  it("allows owners and admins to manage API keys", () => {
    expect(hasDashboardCapability("OWNER", "API_KEYS_MANAGE")).toBe(true);
    expect(hasDashboardCapability("ADMIN", "API_KEYS_MANAGE")).toBe(true);
  });

  it("does not allow developers or viewers to manage API keys", () => {
    expect(hasDashboardCapability("DEVELOPER", "API_KEYS_MANAGE")).toBe(false);
    expect(hasDashboardCapability("VIEWER", "API_KEYS_MANAGE")).toBe(false);
  });

  it("allows developers to mutate runs, schedules, and deployments", () => {
    expect(hasDashboardCapability("DEVELOPER", "RUNS_MUTATE")).toBe(true);
    expect(hasDashboardCapability("DEVELOPER", "SCHEDULES_MANAGE")).toBe(true);
    expect(hasDashboardCapability("DEVELOPER", "DEPLOYMENTS_MANAGE")).toBe(true);
  });

  it("does not allow viewers to mutate resources", () => {
    expect(hasDashboardCapability("VIEWER", "RUNS_MUTATE")).toBe(false);
    expect(hasDashboardCapability("VIEWER", "SCHEDULES_MANAGE")).toBe(false);
    expect(hasDashboardCapability("VIEWER", "DEPLOYMENTS_MANAGE")).toBe(false);
  });
});
