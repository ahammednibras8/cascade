import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDashboardApiAuthorization,
  DASHBOARD_API_AUTH_HEADER,
} from "@cascade/core/dashboard-api-auth";

const prisma = vi.hoisted(() => ({
  environment: {
    findUnique: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  organizationMember: {
    findUnique: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  ApiKeyScope: {
    TASKS_READ: "TASKS_READ",
    TASKS_TRIGGER: "TASKS_TRIGGER",
    SCHEDULES_WRITE: "SCHEDULES_WRITE",
    RUNS_READ: "RUNS_READ",
    RUNS_CANCEL: "RUNS_CANCEL",
    RUNS_REPLAY: "RUNS_REPLAY",
    DEPLOYMENTS_WRITE: "DEPLOYMENTS_WRITE",
    API_KEYS_MANAGE: "API_KEYS_MANAGE",
  },
  prisma,
}));

const { requireDashboardUserAuthorization } = await import("../../src/auth/dashboard-user.js");

const SECRET = "test-dashboard-api-auth-secret-that-is-definitely-long-enough";

const claims = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  environmentId: "44444444-4444-4444-8444-444444444444",
};

function createApp() {
  const app = express();

  app.use(requireDashboardUserAuthorization());

  app.get("/protected", (req, response) => {
    response.json({
      auth: req.auth,
    });
  });

  return app;
}

describe("dashboard-user API authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.DASHBOARD_API_AUTH_SECRET = SECRET;

    prisma.organizationMember.findUnique.mockResolvedValue({
      role: "DEVELOPER",
    });

    prisma.environment.findUnique.mockResolvedValue({
      projectId: claims.projectId,
      project: {
        organizationId: claims.organizationId,
      },
    });
  });

  it("authenticates a signed member with its environment context", async () => {
    const token = createDashboardApiAuthorization(claims, SECRET);

    const response = await request(createApp())
      .get("/protected")
      .set(DASHBOARD_API_AUTH_HEADER, token);

    expect(response.status).toBe(200);
    expect(response.body.auth).toEqual({
      authType: "dashboard-user",
      principalId: `dashboard-user:${claims.userId}`,
      userId: claims.userId,
      organizationId: claims.organizationId,
      role: "DEVELOPER",
      environmentId: claims.environmentId,
      projectId: claims.projectId,
      scopes: [
        "TASKS_READ",
        "TASKS_TRIGGER",
        "SCHEDULES_WRITE",
        "RUNS_READ",
        "RUNS_CANCEL",
        "RUNS_REPLAY",
        "DEPLOYMENTS_WRITE",
      ],
    });
  });

  it("rejects a user who is no longer an organization member", async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    const token = createDashboardApiAuthorization(claims, SECRET);

    const response = await request(createApp())
      .get("/protected")
      .set(DASHBOARD_API_AUTH_HEADER, token);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an environment outside the claimed organization", async () => {
    prisma.environment.findUnique.mockResolvedValue({
      projectId: claims.projectId,
      project: {
        organizationId: "other-organization",
      },
    });

    const token = createDashboardApiAuthorization(claims, SECRET);

    const response = await request(createApp())
      .get("/protected")
      .set(DASHBOARD_API_AUTH_HEADER, token);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
