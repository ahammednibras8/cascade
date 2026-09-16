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
const dashboardOnboardingFindUnique = vi.hoisted(() =>
  vi.fn<(input: unknown) => Promise<unknown>>(),
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
  getDashboardWorkspaceContext: vi.fn<() => void>(),
}));

vi.mock("../../../app/features/api-keys/api-key-actions.server.js", () => ({
  handleApiKeyAction,
}));

vi.mock("../../../app/lib/auth/dashboard-permissions.server.js", () => ({
  requireDashboardCapability,
}));

vi.mock("@cascade/database", () => ({
  prisma: {
    dashboardOnboarding: {
      findUnique: dashboardOnboardingFindUnique,
      upsert: vi.fn<(input: unknown) => Promise<unknown>>(),
    },
  },
}));

const { loader } = await import("../../../app/routes/auth/login-page.js");
const originalAuthMode = process.env["DASHBOARD_AUTH_MODE"];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["DASHBOARD_AUTH_MODE"];
  getDashboardSession.mockResolvedValue(null);
  dashboardOnboardingFindUnique.mockResolvedValue({
    displayedStep: "activation",
  });
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
    identity: null,
    progressStage: "authentication",
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
    identity: null,
    progressStage: "authentication",
    returnTo: "/dashboard",
    stage: "authentication",
  });
});

it("returns a readable message for an allowlisted login error", async () => {
  const result = await loader({
    request: new Request("http://dashboard.test/login?error=email_not_verified"),
  } as never);

  expect(result).toMatchObject({
    error: "Your identity provider must verify your email address before you can sign in.",
    stage: "authentication",
  });
});

it("does not return an unrecognized login error to the UI", async () => {
  const result = await loader({
    request: new Request(
      "http://dashboard.test/login?error=client_secret%3Draw-provider-description",
    ),
  } as never);

  expect(result).toMatchObject({
    error: null,
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
    identity: {
      displayName: "Ahammed Nibras",
      email: "nibras@example.test",
      provider: "https://identity.example.test",
    },
    progressStage: "workspace",
    returnTo: "/dashboard",
    stage: "workspace",
  });
});

it("redirects an authenticated user with a workspace into the product", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  resolveDashboardActivationState.mockResolvedValue({
    state: "ACTIVATED",
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
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
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
    identity: {
      displayName: "Ahammed Nibras",
      email: "nibras@example.test",
      provider: "https://identity.example.test",
    },
    progressStage: "activation",
    returnTo: "/runs",
    stage: "activation",
  });
});

it.each([
  { storedStep: "authentication", expectedStep: "authentication" },
  { storedStep: "workspace", expectedStep: "workspace" },
  { storedStep: "activation", expectedStep: "activation" },
  { storedStep: null, expectedStep: "activation" },
  { storedStep: "unknown-step", expectedStep: "activation" },
])("restores $storedStep as $expectedStep", async ({ storedStep, expectedStep }) => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  resolveDashboardActivationState.mockResolvedValue({
    state: "CREDENTIAL_REQUIRED",
    environmentId: "environment-1",
  });
  dashboardOnboardingFindUnique.mockResolvedValue(
    storedStep === null ? null : { displayedStep: storedStep },
  );

  const result = await loader({
    request: new Request("http://dashboard.test/login"),
  } as never);

  expect(result).toMatchObject({
    progressStage: "activation",
    stage: expectedStep,
  });
  expect(dashboardOnboardingFindUnique).toHaveBeenCalledWith({
    where: {
      userId_environmentId: {
        userId: "user-1",
        environmentId: "environment-1",
      },
    },
    select: {
      dismissedAt: true,
      displayedStep: true,
    },
  });
});

it.each([
  { returnTo: "/runs", redirectTo: "/runs" },
  { returnTo: "https://attacker.example.test", redirectTo: "/dashboard" },
])("keeps dismissed onboarding out of the login shell", async ({ returnTo, redirectTo }) => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  resolveDashboardActivationState.mockResolvedValue({
    state: "CREDENTIAL_REQUIRED",
    environmentId: "environment-1",
  });
  dashboardOnboardingFindUnique.mockResolvedValue({
    dismissedAt: new Date("2026-09-16T00:00:00.000Z"),
    displayedStep: "activation",
  });

  const response = await loader({
    request: new Request(`http://dashboard.test/login?returnTo=${encodeURIComponent(returnTo)}`),
  } as never).catch((error: unknown) => error);

  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(302);
  expect((response as Response).headers.get("Location")).toBe(redirectTo);
  expect(resolveDashboardActivationState).toHaveBeenCalledOnce();
});
