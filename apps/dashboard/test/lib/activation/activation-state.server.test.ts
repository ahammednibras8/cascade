import { beforeEach, describe, expect, it, vi } from "vitest";

const getDashboardSession = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());

const getDashboardWorkspaceContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);

const prisma = vi.hoisted(() => ({
  environment: {
    findFirst: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  taskRun: {
    findFirst: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("../../../app/lib/auth/dashboard-session.server.js", () => ({
  getDashboardSession,
}));

vi.mock("../../../app/lib/workspace/dashboard-workspace.server.js", () => ({
  getDashboardWorkspaceContext,
}));

vi.mock("@cascade/database", () => ({
  ApiKeyScope: {
    DEPLOYMENTS_WRITE: "DEPLOYMENTS_WRITE",
    RUNS_READ: "RUNS_READ",
    TASKS_TRIGGER: "TASKS_TRIGGER",
  },
  prisma,
}));

const { resolveDashboardActivationState } =
  await import("../../../app/lib/activation/activation-state.server.js");

const request = new Request("http://dashboard.test/login");
const environmentId = "environment-1";
const deploymentId = "deployment-1";

function setWorkspace(environment: { id: string } | null) {
  getDashboardWorkspaceContext.mockResolvedValue({
    activeEnvironment: environment,
  });
}

function setEnvironment(input: {
  activeApiKey?: boolean;
  deployment?: {
    id: string;
    runtimeStatus: "PENDING" | "STARTING" | "RUNNING" | "DRAINING" | "STOPPED" | "FAILED";
    taskCount: number;
  } | null;
}) {
  prisma.environment.findFirst.mockResolvedValue({
    id: environmentId,
    apiKeys: input.activeApiKey ? [{ id: "api-key-1" }] : [],
    deployments: input.deployment
      ? [
          {
            id: input.deployment.id,
            runtimeStatus: input.deployment.runtimeStatus,
            tasks: Array.from({ length: input.deployment.taskCount }, (_, index) => ({
              id: `task-${index + 1}`,
            })),
          },
        ]
      : [],
  });
}

describe("resolveDashboardActivationState", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getDashboardSession.mockResolvedValue({
      userId: "user-1",
    });
    setWorkspace({
      id: environmentId,
    });
    prisma.taskRun.findFirst.mockResolvedValue(null);
  });

  it("returns AUTH_REQUIRED without a session", async () => {
    getDashboardSession.mockResolvedValue(null);

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "AUTH_REQUIRED",
    });

    expect(getDashboardWorkspaceContext).not.toHaveBeenCalled();
  });

  it("returns WORKSPACE_REQUIRED without an active environment", async () => {
    setWorkspace(null);

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "WORKSPACE_REQUIRED",
    });

    expect(prisma.environment.findFirst).not.toHaveBeenCalled();
  });

  it("returns CREDENTIAL_REQUIRED without a usable quickstart API key", async () => {
    setEnvironment({
      activeApiKey: false,
    });

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "CREDENTIAL_REQUIRED",
      environmentId,
    });
  });

  it("returns STARTER_REQUIRED without an active deployment", async () => {
    setEnvironment({
      activeApiKey: true,
      deployment: null,
    });

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "STARTER_REQUIRED",
      environmentId,
    });
  });

  it("returns STARTER_REQUIRED when the active deployment has no tasks", async () => {
    setEnvironment({
      activeApiKey: true,
      deployment: {
        id: deploymentId,
        runtimeStatus: "RUNNING",
        taskCount: 0,
      },
    });

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "STARTER_REQUIRED",
      environmentId,
    });
  });

  it("returns DEPLOYMENT_PENDING until the deployment worker is running", async () => {
    setEnvironment({
      activeApiKey: true,
      deployment: {
        id: deploymentId,
        runtimeStatus: "STARTING",
        taskCount: 1,
      },
    });

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "DEPLOYMENT_PENDING",
      deploymentId,
      environmentId,
      runtimeStatus: "STARTING",
    });

    expect(prisma.taskRun.findFirst).not.toHaveBeenCalled();
  });

  it("returns FIRST_RUN_PENDING when no completed deployment run exists", async () => {
    setEnvironment({
      activeApiKey: true,
      deployment: {
        id: deploymentId,
        runtimeStatus: "RUNNING",
        taskCount: 1,
      },
    });
    prisma.taskRun.findFirst.mockResolvedValue(null);

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "FIRST_RUN_PENDING",
      deploymentId,
      environmentId,
    });
  });

  it("returns ACTIVATED after a deployment task completes", async () => {
    setEnvironment({
      activeApiKey: true,
      deployment: {
        id: deploymentId,
        runtimeStatus: "RUNNING",
        taskCount: 1,
      },
    });
    prisma.taskRun.findFirst.mockResolvedValue({
      id: "task-run-1",
    });

    await expect(resolveDashboardActivationState(request)).resolves.toEqual({
      state: "ACTIVATED",
      deploymentId,
      environmentId,
    });
  });
});
