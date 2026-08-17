import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeApiRequest = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>());

vi.mock("../../app/lib/cascade-api.server.js", () => ({
  cascadeApiRequest,
}));

const { loader } = await import("../../app/routes/deployments.js");

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: "deployment-1",
    environmentId: "environment-1",
    version: "v1.2.3",
    image: "ghcr.io/cascade/worker:v1.2.3",
    status: "ACTIVE",
    runtimeStatus: "RUNNING",
    runtimeError: null,
    runtimeStartedAt: "2026-08-15T10:00:00.000Z",
    runtimeStoppedAt: null,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    tasksCount: 3,
    runsCount: 12,
    ...overrides,
  };
}

describe("deployments loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns deployments from the Cascade API", async () => {
    const deployments = [
      deployment(),
      deployment({
        id: "deployment-2",
        version: "v1.2.2",
        status: "INACTIVE",
        runtimeStatus: "STOPPED",
        runtimeStartedAt: null,
        runtimeStoppedAt: "2026-08-14T10:00:00.000Z",
        tasksCount: 2,
        runsCount: 8,
      }),
    ];

    cascadeApiRequest.mockResolvedValue({
      deployments,
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/deployments") } as never),
    ).resolves.toEqual({
      deployments,
    });

    expect(cascadeApiRequest).toHaveBeenCalledWith("/api/deployments");
  });

  it("returns an empty list when the API has no deployments", async () => {
    cascadeApiRequest.mockResolvedValue({
      deployments: [],
    });

    await expect(
      loader({ request: new Request("http://dashboard.test/deployments") } as never),
    ).resolves.toEqual({
      deployments: [],
    });
  });
});
