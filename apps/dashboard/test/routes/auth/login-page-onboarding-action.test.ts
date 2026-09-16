import { beforeEach, expect, it, vi } from "vitest";

const getDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
const getDashboardWorkspaceContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);
const dashboardOnboardingUpsert = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  commitDashboardSession: vi.fn<() => void>(),
  getDashboardSession,
  rotateDashboardSession: vi.fn<() => void>(),
}));

vi.mock("../../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  commitActiveDashboardEnvironment: vi.fn<() => void>(),
  getDashboardWorkspaceContext,
}));

vi.mock("../../../app/lib/workspace/dashboard-organization.server.js", () => ({
  commitActiveDashboardOrganization: vi.fn<() => void>(),
}));

vi.mock("../../../app/lib/activation/activation-state.server.js", () => ({
  resolveDashboardActivationState: vi.fn<() => void>(),
  resolveWorkspaceActivationState: vi.fn<() => void>(),
}));

vi.mock("../../../app/lib/auth/dashboard-user.server.js", () => ({
  findOrCreateDevDashboardUser: vi.fn<() => void>(),
  getDashboardUserIdentitySummary: vi.fn<() => void>(),
}));

vi.mock("../../../app/lib/auth/create-personal-workspace.server.js", () => ({
  createPersonalWorkspace: vi.fn<() => void>(),
}));

vi.mock("../../../app/features/api-keys/api-key-actions.server.js", () => ({
  handleApiKeyAction: vi.fn<() => void>(),
}));

vi.mock("../../../app/lib/auth/dashboard-permissions.server.js", () => ({
  requireDashboardCapability: vi.fn<() => void>(),
}));

vi.mock("@cascade/database", () => ({
  prisma: {
    dashboardOnboarding: {
      upsert: dashboardOnboardingUpsert,
    },
  },
}));

const { action } = await import("../../../app/routes/auth/login-page.js");

beforeEach(() => {
  vi.clearAllMocks();
  getDashboardSession.mockResolvedValue(null);
  getDashboardWorkspaceContext.mockResolvedValue({
    activeEnvironment: {
      id: "environment-1",
    },
  });
  dashboardOnboardingUpsert.mockResolvedValue({ id: "onboarding-1" });
});

it("rejects an invalid displayed onboarding step", async () => {
  const response = await submitDisplayedStep("credentials");

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "invalid_displayed_step",
    ok: false,
  });
  expect(getDashboardSession).not.toHaveBeenCalled();
  expect(dashboardOnboardingUpsert).not.toHaveBeenCalled();
});

it("requires authentication before persisting the displayed onboarding step", async () => {
  const response = await submitDisplayedStep("activation");

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: "authentication_required",
    ok: false,
  });
  expect(getDashboardWorkspaceContext).not.toHaveBeenCalled();
  expect(dashboardOnboardingUpsert).not.toHaveBeenCalled();
});

it("requires an active workspace before persisting the displayed onboarding step", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  getDashboardWorkspaceContext.mockResolvedValue({ activeEnvironment: null });

  const response = await submitDisplayedStep("activation");

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
    error: "workspace_required",
    ok: false,
  });
  expect(dashboardOnboardingUpsert).not.toHaveBeenCalled();
});

it.each(["authentication", "workspace", "activation"] as const)(
  "persists the %s onboarding view without changing technical completion",
  async (displayedStep) => {
    getDashboardSession.mockResolvedValue({ userId: "user-1" });

    const response = await submitDisplayedStep(displayedStep);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      displayedStep,
      ok: true,
    });
    expect(dashboardOnboardingUpsert).toHaveBeenCalledWith({
      where: {
        userId_environmentId: {
          userId: "user-1",
          environmentId: "environment-1",
        },
      },
      update: {
        displayedStep,
      },
      create: {
        userId: "user-1",
        environmentId: "environment-1",
        selectedSetupPath: "sdk",
        displayedStep,
      },
    });
  },
);

it("requires authentication before dismissing onboarding", async () => {
  const response = await submitDismissal("/runs");

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: "authentication_required",
    ok: false,
  });
  expect(getDashboardWorkspaceContext).not.toHaveBeenCalled();
  expect(dashboardOnboardingUpsert).not.toHaveBeenCalled();
});

it("requires an active workspace before dismissing onboarding", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  getDashboardWorkspaceContext.mockResolvedValue({ activeEnvironment: null });

  const response = await submitDismissal("/runs");

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
    error: "workspace_required",
    ok: false,
  });
  expect(dashboardOnboardingUpsert).not.toHaveBeenCalled();
});

it.each([
  { returnTo: "/runs", redirectTo: "/runs" },
  { returnTo: "https://attacker.example.test", redirectTo: "/dashboard" },
])("dismisses onboarding and returns $redirectTo", async ({ returnTo, redirectTo }) => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });

  const response = await submitDismissal(returnTo);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    redirectTo,
  });
  expect(dashboardOnboardingUpsert).toHaveBeenCalledWith({
    where: {
      userId_environmentId: {
        userId: "user-1",
        environmentId: "environment-1",
      },
    },
    update: {
      dismissedAt: expect.any(Date),
    },
    create: {
      userId: "user-1",
      environmentId: "environment-1",
      selectedSetupPath: "sdk",
      displayedStep: "activation",
      dismissedAt: expect.any(Date),
    },
  });
});

it("requires authentication before restarting onboarding", async () => {
  const response = await submitRestart();

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: "authentication_required",
    ok: false,
  });
  expect(getDashboardWorkspaceContext).not.toHaveBeenCalled();
  expect(dashboardOnboardingUpsert).not.toHaveBeenCalled();
});

it("requires an active workspace before restarting onboarding", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });
  getDashboardWorkspaceContext.mockResolvedValue({ activeEnvironment: null });

  const response = await submitRestart();

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
    error: "workspace_required",
    ok: false,
  });
  expect(dashboardOnboardingUpsert).not.toHaveBeenCalled();
});

it("restarts presentation metadata without changing technical completion", async () => {
  getDashboardSession.mockResolvedValue({ userId: "user-1" });

  const response = await submitRestart();

  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe("/login");
  expect(dashboardOnboardingUpsert).toHaveBeenCalledWith({
    where: {
      userId_environmentId: {
        userId: "user-1",
        environmentId: "environment-1",
      },
    },
    update: {
      startedAt: expect.any(Date),
      restartedAt: expect.any(Date),
      dismissedAt: null,
      displayedStep: "activation",
    },
    create: {
      userId: "user-1",
      environmentId: "environment-1",
      startedAt: expect.any(Date),
      restartedAt: expect.any(Date),
      selectedSetupPath: "sdk",
      displayedStep: "activation",
    },
  });
});

async function submitDisplayedStep(displayedStep: string) {
  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({
        intent: "update_displayed_step",
        displayedStep,
      }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);

  return response as Response;
}

async function submitDismissal(returnTo: string) {
  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({
        intent: "dismiss_onboarding",
        returnTo,
      }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);

  return response as Response;
}

async function submitRestart() {
  const response = await action({
    request: new Request("http://dashboard.test/login", {
      method: "POST",
      body: new URLSearchParams({
        intent: "restart_onboarding",
      }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);

  return response as Response;
}
