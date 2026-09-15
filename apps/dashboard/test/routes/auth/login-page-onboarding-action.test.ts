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
