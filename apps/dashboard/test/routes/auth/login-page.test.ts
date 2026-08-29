import { afterEach, beforeEach, expect, it, vi } from "vitest";

const getDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
const createDashboardSession = vi.hoisted(() => vi.fn<(userId: string) => Promise<unknown>>());
const commitDashboardSession = vi.hoisted(() => vi.fn<(token: string) => Promise<string>>());
const findOrCreateDevDashboardUser = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const resolveDashboardActivationState = vi.hoisted(() =>
  vi.fn<(request: Request) => Promise<unknown>>(),
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

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  commitDashboardSession,
  createDashboardSession,
  getDashboardSession,
}));

vi.mock("../../../app/lib/auth/dashboard-user.server.js", () => ({
  findOrCreateDevDashboardUser,
}));

vi.mock("../../../app/lib/activation/activation-state.server.js", () => ({
  resolveDashboardActivationState,
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

const { action, loader } = await import("../../../app/routes/auth/login-page.js");
const originalAuthMode = process.env["DASHBOARD_AUTH_MODE"];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["DASHBOARD_AUTH_MODE"];
  getDashboardSession.mockResolvedValue(null);
  resolveDashboardActivationState.mockResolvedValue({ state: "AUTH_REQUIRED" });
});

afterEach(() => {
  if (originalAuthMode === undefined) {
    delete process.env["DASHBOARD_AUTH_MODE"];
  } else {
    process.env["DASHBOARD_AUTH_MODE"] = originalAuthMode;
  }
});

it("preserves an internal return path for the authentication state", async () => {
  const result = await loader({
    request: new Request("http://dashboard.test/login?returnTo=/runs"),
  } as never);

  expect(result).toEqual({
    activationState: null,
    authenticated: false,
    devAuthEnabled: false,
    error: null,
    returnTo: "/runs",
    stage: "authentication",
  });
});

it("rejects an external return path", async () => {
  const result = await loader({
    request: new Request("http://dashboard.test/login?returnTo=https://attacker.example.test"),
  } as never);

  expect(result).toEqual({
    activationState: null,
    authenticated: false,
    devAuthEnabled: false,
    error: null,
    returnTo: "/dashboard",
    stage: "authentication",
  });
});

it("renders workspace state for an authenticated user without a workspace", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  resolveDashboardActivationState.mockResolvedValue({ state: "WORKSPACE_REQUIRED" });

  const result = await loader({
    request: new Request("http://dashboard.test/login"),
  } as never);

  expect(result).toEqual({
    activationState: null,
    authenticated: true,
    devAuthEnabled: false,
    error: null,
    returnTo: "/dashboard",
    stage: "workspace",
  });
});

it("redirects an authenticated user with a workspace into the product", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  resolveDashboardActivationState.mockResolvedValue({
    state: "ACTIVATED",
    deploymentId: "deployment-1",
    environmentId: "environment-1",
  });

  const response = await loader({
    request: new Request("http://dashboard.test/login?returnTo=/runs"),
  } as never).catch((error: unknown) => error);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(302);
  expect((response as Response).headers.get("Location")).toBe("/runs");
});

it.each([
  { state: "CREDENTIAL_REQUIRED", environmentId: "environment-1" },
  { state: "STARTER_REQUIRED", environmentId: "environment-1" },
  {
    state: "DEPLOYMENT_PENDING",
    deploymentId: "deployment-1",
    environmentId: "environment-1",
    runtimeStatus: "STARTING",
  },
  {
    state: "FIRST_RUN_PENDING",
    deploymentId: "deployment-1",
    environmentId: "environment-1",
  },
])("returns the activation shell for $state", async (activationState) => {
  resolveDashboardActivationState.mockResolvedValue(activationState);

  await expect(
    loader({
      request: new Request("http://dashboard.test/login?returnTo=/runs"),
    } as never),
  ).resolves.toEqual({
    activationState,
    authenticated: true,
    devAuthEnabled: false,
    error: null,
    returnTo: "/runs",
    stage: "activation",
  });
});

it("creates a development session without navigating away from login", async () => {
  process.env["DASHBOARD_AUTH_MODE"] = "dev";
  findOrCreateDevDashboardUser.mockResolvedValue({ id: "user-1" });
  createDashboardSession.mockResolvedValue({ token: "session-token" });
  commitDashboardSession.mockResolvedValue("cascade-session=signed; HttpOnly");

  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({ intent: "authenticate" }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);
  await expect((response as Response).json()).resolves.toEqual({
    ok: true,
    stage: "workspace",
  });
  expect((response as Response).headers.get("Set-Cookie")).toContain("cascade-session=");
  expect(findOrCreateDevDashboardUser).toHaveBeenCalledWith();
  expect(createDashboardSession).toHaveBeenCalledWith("user-1");
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
        returnTo: "/runs",
      }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(302);
  expect((response as Response).headers.get("Location")).toBe("/login?returnTo=%2Fruns");

  expect(createPersonalWorkspace).toHaveBeenCalledWith({
    userId: "user-1",
    projectName: "Cascade",
  });
  expect(commitActiveDashboardOrganization).toHaveBeenCalledWith("organization-1");
  expect(commitActiveDashboardEnvironment).toHaveBeenCalledWith("environment-1");
});
