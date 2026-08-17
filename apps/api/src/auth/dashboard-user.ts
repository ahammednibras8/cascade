import type { Request, RequestHandler } from "express";
import { verifyDashboardApiAuthorization } from "@cascade/core/dashboard-api-auth";
import type { ApiAuthContext } from "./api-key.js";
import { ApiKeyScope, prisma } from "@cascade/database";

const ALL_SCOPES: ApiKeyScope[] = [
  ApiKeyScope.TASKS_READ,
  ApiKeyScope.TASKS_TRIGGER,
  ApiKeyScope.SCHEDULES_WRITE,
  ApiKeyScope.RUNS_READ,
  ApiKeyScope.RUNS_CANCEL,
  ApiKeyScope.RUNS_REPLAY,
  ApiKeyScope.DEPLOYMENTS_WRITE,
  ApiKeyScope.API_KEYS_MANAGE,
];

const DEVELOPER_SCOPES: ApiKeyScope[] = [
  ApiKeyScope.TASKS_READ,
  ApiKeyScope.TASKS_TRIGGER,
  ApiKeyScope.SCHEDULES_WRITE,
  ApiKeyScope.RUNS_READ,
  ApiKeyScope.RUNS_CANCEL,
  ApiKeyScope.RUNS_REPLAY,
  ApiKeyScope.DEPLOYMENTS_WRITE,
];

const VIEWER_SCOPES: ApiKeyScope[] = [ApiKeyScope.TASKS_READ, ApiKeyScope.RUNS_READ];
const DASHBOARD_API_AUTH_HEADER = "x-cascade-dashboard-authorization";

function getDashboardApiAuthSecret() {
  const secret = process.env.DASHBOARD_API_AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("DASHBOARD_API_AUTH_SECRET must be at least 32 characters");
  }

  return secret;
}

function scopesForRole(role: "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER"): ApiKeyScope[] {
  if (role === "OWNER" || role === "ADMIN") {
    return ALL_SCOPES;
  }

  if (role === "DEVELOPER") {
    return DEVELOPER_SCOPES;
  }

  return VIEWER_SCOPES;
}

function getDashboardAuthorizationFromRequest(request: Request) {
  return request.get(DASHBOARD_API_AUTH_HEADER)?.trim();
}

async function authenticateDashboardUser(token: string): Promise<ApiAuthContext | null> {
  const claims = verifyDashboardApiAuthorization(token, getDashboardApiAuthSecret());

  if (!claims) {
    return null;
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: claims.organizationId,
        userId: claims.userId,
      },
    },
    select: {
      role: true,
    },
  });

  if (!membership) {
    return null;
  }

  const environment = await prisma.environment.findUnique({
    where: {
      id: claims.environmentId,
    },
    select: {
      projectId: true,
      project: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (
    !environment ||
    environment.projectId !== claims.projectId ||
    environment.project.organizationId !== claims.organizationId
  ) {
    return null;
  }

  return {
    authType: "dashboard-user",
    principalId: `dashboard-user:${claims.userId}`,
    userId: claims.userId,
    organizationId: claims.organizationId,
    role: membership.role,
    environmentId: claims.environmentId,
    projectId: claims.projectId,
    scopes: scopesForRole(membership.role),
  };
}

export function requireDashboardUserAuthorization(): RequestHandler {
  return async (request, response, next) => {
    try {
      const token = getDashboardAuthorizationFromRequest(request);

      if (!token) {
        next();
        return;
      }

      const auth = await authenticateDashboardUser(token);

      if (!auth) {
        response.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid dashboard authorization",
          },
        });
        return;
      }

      request.auth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}
