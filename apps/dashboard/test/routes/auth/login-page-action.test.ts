import { afterEach, beforeEach, expect, it, vi } from "vitest";

const getDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
const rotateDashboardSession = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);
const commitDashboardSession = vi.hoisted(() =>
  vi.fn<(session: { token: string; expiresAt: Date }) => Promise<string>>(),
);
const findOrCreateDevDashboardUser = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const getDashboardUserIdentitySummary = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<unknown>>(),
);
const resolveDashboardActivationState = vi.hoisted(() =>
  vi.fn<(request: Request, existingSession?: unknown) => Promise<unknown>>(),
);
const resolveWorkspaceActivationState = vi.hoisted(() =>
  vi.fn<(environmentId: string, userId: string) => Promise<unknown>>(),
);
const createPersonalWorkspace = vi.hoisted(() =>
  vi.fn<
    (input: { projectName: string; userId: string }) => Promise<{
      environmentId: string;
      organizationId: string;
      projectId: string;
    }>
  >(),
);
const commitActiveDashboardOrganization = vi.hoisted(() =>
  vi.fn<(organizationId: string) => Promise<string>>(),
);
const commitActiveDashboardEnvironment = vi.hoisted(() =>
  vi.fn<(environmentId: string) => Promise<string>>(),
);
const handleApiKeyAction = vi.hoisted(() =>
  vi.fn<(request: Request, formData: FormData) => Promise<Response>>(),
);
const requireDashboardCapability = vi.hoisted(() =>
  vi.fn<(request: Request, capability: string) => Promise<unknown>>(),
);

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  commitDashboardSession,
  getDashboardSession,
  rotateDashboardSession,
}));

vi.mock("../../../app/lib/auth/dashboard-user.server.js", () => ({
  findOrCreateDevDashboardUser,
  getDashboardUserIdentitySummary,
}));

vi.mock("../../../app/lib/activation/activation-state.server.js", () => ({
  resolveDashboardActivationState,
  resolveWorkspaceActivationState,
}));

vi.mock("../../../app/lib/auth/create-personal-workspace.server.js", () => ({
  createPersonalWorkspace,
}));

vi.mock("../../../app/lib/workspace/dashboard-organization.server.js", () => ({
  commitActiveDashboardOrganization,
}));

vi.mock("../../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  commitActiveDashboardEnvironment,
}));

vi.mock("../../../app/features/api-keys/api-key-actions.server.js", () => ({
  handleApiKeyAction,
}));

vi.mock("../../../app/lib/auth/dashboard-permissions.server.js", () => ({
  requireDashboardCapability,
}));

vi.mock("@cascade/database", () => ({
  prisma: {
    dashboardOnboarding: { upsert: vi.fn<(input: unknown) => Promise<unknown>>() },
  },
}));

const { action } = await import("../../../app/routes/auth/login-page.js");
const originalAuthMode = process.env["DASHBOARD_AUTH_MODE"];
const originalPublicApiUrl = process.env["CASCADE_PUBLIC_API_URL"];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["DASHBOARD_AUTH_MODE"];
  process.env["CASCADE_PUBLIC_API_URL"] = "https://api.cascade.test/";
  getDashboardSession.mockResolvedValue(null);
  resolveDashboardActivationState.mockResolvedValue({ state: "AUTH_REQUIRED" });
  resolveWorkspaceActivationState.mockResolvedValue({
    state: "CREDENTIAL_REQUIRED",
    environmentId: "environment-1",
  });
  getDashboardUserIdentitySummary.mockResolvedValue({
    displayName: "Ahammed Nibras",
    email: "nibras@example.test",
    provider: "https://identity.example.test",
  });
});

afterEach(() => {
  if (originalAuthMode === undefined) {
    delete process.env["DASHBOARD_AUTH_MODE"];
  } else {
    process.env["DASHBOARD_AUTH_MODE"] = originalAuthMode;
  }

  if (originalPublicApiUrl === undefined) {
    delete process.env["CASCADE_PUBLIC_API_URL"];
  } else {
    process.env["CASCADE_PUBLIC_API_URL"] = originalPublicApiUrl;
  }
});

it("returns the latest pending activation state without redirecting", async () => {
  const activationState = {
    state: "DEPLOYMENT_PENDING",
    deploymentId: "deployment-1",
    environmentId: "environment-1",
    runtimeStatus: "STARTING",
  };
  resolveDashboardActivationState.mockResolvedValue(activationState);
  const request = new Request("http://dashboard.test/login", {
    method: "POST",
    body: new URLSearchParams({ intent: "refresh_activation" }),
  });

  const response = await action({ request } as never);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(200);
  expect((response as Response).headers.get("Location")).toBeNull();
  await expect((response as Response).json()).resolves.toEqual({
    activationState,
    ok: true,
    stage: "activation",
  });
  expect(resolveDashboardActivationState).toHaveBeenCalledWith(request);
});

it("creates the activation API key through the existing API-key action", async () => {
  const apiKey = {
    id: "api-key-1",
    name: "Local development",
    keyPrefix: "csc_test",
    scopes: ["DEPLOYMENTS_WRITE", "TASKS_TRIGGER", "RUNS_READ"],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    rotatedFromId: null,
  };
  const expectedResponse = Response.json(
    {
      ok: true,
      intent: "create",
      apiKey,
      token: "csc_test_activation_token",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
  handleApiKeyAction.mockResolvedValue(expectedResponse);
  const request = new Request("http://dashboard.test/login", {
    method: "POST",
    body: new URLSearchParams({
      intent: "create_activation_key",
      name: "Local development",
    }),
  });

  const response = await action({ request } as never);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).headers.get("Cache-Control")).toBe("no-store");
  await expect((response as Response).json()).resolves.toEqual({
    ok: true,
    intent: "create",
    apiKey,
    token: "csc_test_activation_token",
    apiUrl: "https://api.cascade.test",
  });
  expect(requireDashboardCapability).toHaveBeenCalledWith(request, "API_KEYS_MANAGE");
  expect(handleApiKeyAction).toHaveBeenCalledOnce();

  const [forwardedRequest, forwardedFormData] = handleApiKeyAction.mock.calls[0] ?? [];

  expect(forwardedRequest).toBe(request);
  expect(forwardedFormData?.get("intent")).toBe("create");
  expect(forwardedFormData?.get("name")).toBe("Local development");
  expect(forwardedFormData?.getAll("scope")).toEqual([
    "DEPLOYMENTS_WRITE",
    "TASKS_TRIGGER",
    "RUNS_READ",
  ]);
});

it.each(["/runs", "https://attacker.example.test"])(
  "returns the completed run after activation",
  async (returnTo) => {
    resolveDashboardActivationState.mockResolvedValue({
      state: "ACTIVATED",
      environmentId: "environment-1",
      runId: "task-run-1",
    });

    const response = await action({
      request: new Request("http://dashboard.test/login", {
        method: "POST",
        body: new URLSearchParams({
          intent: "refresh_activation",
          returnTo,
        }),
      }),
    } as never);

    expect(response).toBeInstanceOf(Response);
    await expect((response as Response).json()).resolves.toEqual({
      ok: true,
      redirectTo: "/runs/task-run-1",
    });
  },
);

it.each([
  { state: "AUTH_REQUIRED", error: "authentication_required", status: 401 },
  { state: "WORKSPACE_REQUIRED", error: "workspace_required", status: 409 },
])("rejects refresh when activation resolves to $state", async ({ state, error, status }) => {
  resolveDashboardActivationState.mockResolvedValue({ state });

  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({ intent: "refresh_activation" }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(status);
  await expect((response as Response).json()).resolves.toEqual({
    error,
    ok: false,
  });
});

it("creates a development session without navigating away from login", async () => {
  process.env["DASHBOARD_AUTH_MODE"] = "dev";
  findOrCreateDevDashboardUser.mockResolvedValue({
    id: "user-1",
    displayName: "Local Dashboard User",
    email: "local-dashboard@example.test",
  });
  rotateDashboardSession.mockResolvedValue({
    token: "session-token",
    expiresAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  commitDashboardSession.mockResolvedValue("cascade-session=signed; HttpOnly");

  const request = new Request("http://dashboard.test/login", {
    method: "POST",
    body: new URLSearchParams({ intent: "authenticate" }),
  });
  const response = await action({ request } as never);

  expect(response).toBeInstanceOf(Response);
  await expect((response as Response).json()).resolves.toEqual({
    identity: {
      displayName: "Local Dashboard User",
      email: "local-dashboard@example.test",
      provider: null,
    },
    ok: true,
    stage: "workspace",
  });
  expect((response as Response).headers.get("Set-Cookie")).toContain("cascade-session=");
  expect(findOrCreateDevDashboardUser).toHaveBeenCalledWith();
  expect(rotateDashboardSession).toHaveBeenCalledWith(request, "user-1");
  expect(commitDashboardSession).toHaveBeenCalledWith({
    token: "session-token",
    expiresAt: new Date("2026-01-01T00:00:00.000Z"),
  });
});

it("returns the persisted identity when development authentication already has a session", async () => {
  process.env["DASHBOARD_AUTH_MODE"] = "dev";
  getDashboardSession.mockResolvedValue({ userId: "user-1" });

  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({ intent: "authenticate" }),
    }),
  } as never);

  expect(response).toEqual({
    identity: {
      displayName: "Ahammed Nibras",
      email: "nibras@example.test",
      provider: "https://identity.example.test",
    },
    ok: true,
    stage: "workspace",
  });
  expect(getDashboardUserIdentitySummary).toHaveBeenCalledWith("user-1");
  expect(findOrCreateDevDashboardUser).not.toHaveBeenCalled();
  expect(rotateDashboardSession).not.toHaveBeenCalled();
});

it("creates a workspace from the login activation form", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  createPersonalWorkspace.mockResolvedValue({
    organizationId: "organization-1",
    projectId: "project-1",
    environmentId: "environment-1",
  });
  commitActiveDashboardOrganization.mockResolvedValue("cascade-active-organization=organization-1");
  commitActiveDashboardEnvironment.mockResolvedValue("cascade-active-environment=environment-1");

  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({
        intent: "create_workspace",
        projectName: "Cascade",
      }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(200);
  expect((response as Response).headers.get("Location")).toBeNull();
  await expect((response as Response).json()).resolves.toEqual({
    activationState: {
      state: "CREDENTIAL_REQUIRED",
      environmentId: "environment-1",
    },
    ok: true,
    stage: "activation",
  });

  expect(createPersonalWorkspace).toHaveBeenCalledWith({
    userId: "user-1",
    projectName: "Cascade",
  });
  expect(resolveWorkspaceActivationState).toHaveBeenCalledWith("environment-1", "user-1");
  expect(commitActiveDashboardOrganization).toHaveBeenCalledWith("organization-1");
  expect(commitActiveDashboardEnvironment).toHaveBeenCalledWith("environment-1");
  expect((response as Response).headers.get("Set-Cookie")).toContain(
    "cascade-active-organization=organization-1",
  );
  expect((response as Response).headers.get("Set-Cookie")).toContain(
    "cascade-active-environment=environment-1",
  );
});

it.each(["", "   "])("rejects an invalid workspace project name", async (projectName) => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });

  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({
        intent: "create_workspace",
        projectName,
      }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(400);
  await expect((response as Response).json()).resolves.toEqual({
    error: "project_name_required",
    ok: false,
  });
  expect(createPersonalWorkspace).not.toHaveBeenCalled();
});
