import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDashboardUser = vi.hoisted(() =>
  vi.fn<(request: Request) => Promise<{ userId: string }>>(),
);
const getDashboardWorkspaceContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);
const resolveWorkspaceActivationState = vi.hoisted(() =>
  vi.fn<(environmentId: string, userId: string) => Promise<unknown>>(),
);
const getDashboardOnboardingPresentation = vi.hoisted(() =>
  vi.fn<(userId: string, environmentId: string) => Promise<unknown>>(),
);

vi.mock("../../app/lib/auth/dashboard-auth.server.js", () => ({
  requireDashboardUser,
}));

vi.mock("../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  getDashboardWorkspaceContext,
}));

vi.mock("../../app/lib/activation/activation-state.server.js", () => ({
  resolveWorkspaceActivationState,
}));

vi.mock("../../app/lib/activation/onboarding-metadata.server.js", () => ({
  getDashboardOnboardingPresentation,
}));

const { loader } = await import("../../app/routes/dashboard.js");

const request = new Request("http://dashboard.test/dashboard");
const workspace = {
  activeEnvironment: {
    id: "environment-1",
    name: "Development",
    slug: "dev",
    type: "DEVELOPMENT",
  },
  activeOrganization: null,
  activeProject: null,
  organizations: [],
  projects: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireDashboardUser.mockResolvedValue({ userId: "user-1" });
  getDashboardWorkspaceContext.mockResolvedValue(workspace);
  resolveWorkspaceActivationState.mockResolvedValue({
    state: "CREDENTIAL_REQUIRED",
    environmentId: "environment-1",
  });
  getDashboardOnboardingPresentation.mockResolvedValue({
    dismissedAt: null,
    displayedStep: "activation",
  });
});

describe("dashboard onboarding restart state", () => {
  it("does not resolve onboarding without an active environment", async () => {
    getDashboardWorkspaceContext.mockResolvedValue({
      ...workspace,
      activeEnvironment: null,
    });

    await expect(loader({ request } as never)).resolves.toMatchObject({
      activeEnvironment: null,
      canRestartOnboarding: false,
    });
    expect(resolveWorkspaceActivationState).not.toHaveBeenCalled();
    expect(getDashboardOnboardingPresentation).not.toHaveBeenCalled();
  });

  it("does not offer restart while incomplete onboarding is active", async () => {
    await expect(loader({ request } as never)).resolves.toMatchObject({
      canRestartOnboarding: false,
    });
  });

  it("offers restart when incomplete onboarding was dismissed", async () => {
    getDashboardOnboardingPresentation.mockResolvedValue({
      dismissedAt: new Date("2026-09-16T00:00:00.000Z"),
      displayedStep: "activation",
    });

    await expect(loader({ request } as never)).resolves.toMatchObject({
      canRestartOnboarding: true,
    });
    expect(resolveWorkspaceActivationState).toHaveBeenCalledWith("environment-1", "user-1");
    expect(getDashboardOnboardingPresentation).toHaveBeenCalledWith("user-1", "environment-1");
  });

  it("does not offer restart when the environment is technically activated", async () => {
    resolveWorkspaceActivationState.mockResolvedValue({
      state: "ACTIVATED",
      environmentId: "environment-1",
    });
    getDashboardOnboardingPresentation.mockResolvedValue({
      dismissedAt: new Date("2026-09-16T00:00:00.000Z"),
      displayedStep: "activation",
    });

    await expect(loader({ request } as never)).resolves.toMatchObject({
      canRestartOnboarding: false,
    });
  });
});
