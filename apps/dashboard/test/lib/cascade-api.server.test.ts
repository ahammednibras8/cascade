import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createDashboardApiAuthorizationForRequest = vi.hoisted(() =>
  vi.fn<(request: Request) => Promise<string>>(),
);

vi.mock("../../app/lib/dashboard-api-authorization.server.js", () => ({
  createDashboardApiAuthorizationForRequest,
}));

const { cascadeDashboardApiRequest, cascadeDashboardApiStreamRequest } =
  await import("../../app/lib/cascade-api.server.js");

const originalApiUrl = process.env.CASCADE_API_URL;

const fetchMock = vi.fn<typeof fetch>();

function mockJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

describe("cascadeDashboardApiRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    createDashboardApiAuthorizationForRequest.mockResolvedValue("signed-human-dashboard-auth");

    process.env.CASCADE_API_URL = "http://localhost:3001/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    process.env.CASCADE_API_URL = originalApiUrl;
  });

  it("calls the Cascade API with signed dashboard-user authorization", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        tasks: [],
      }),
    );
    const request = new Request("http://dashboard.test/tasks");

    const body = await cascadeDashboardApiRequest<{ tasks: unknown[] }>(request, "/api/tasks");

    expect(body).toEqual({
      tasks: [],
    });
    expect(createDashboardApiAuthorizationForRequest).toHaveBeenCalledWith(request);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/tasks", {
      headers: {
        "x-cascade-dashboard-authorization": "signed-human-dashboard-auth",
      },
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
  });

  it("does not send the legacy dashboard API key", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        taskRun: {
          id: "run-1",
        },
      }),
    );

    await cascadeDashboardApiRequest(
      new Request("http://dashboard.test/runs/run-1"),
      "/api/runs/run-1",
      {
        headers: {
          "Idempotency-Key": "read-1",
        },
      },
    );

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      "Idempotency-Key": "read-1",
      "x-cascade-dashboard-authorization": "signed-human-dashboard-auth",
    });
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain("csc_dashboard_test_key");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
  });
});

describe("cascadeDashboardApiStreamRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    createDashboardApiAuthorizationForRequest.mockResolvedValue("signed-human-dashboard-auth");

    process.env.CASCADE_API_URL = "http://localhost:3001/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    process.env.CASCADE_API_URL = originalApiUrl;
  });

  it("calls the Cascade API SSE endpoint with signed dashboard-user authorization", async () => {
    const streamResponse = new Response("event: runs-changed\ndata: {}\n\n", {
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
    fetchMock.mockResolvedValue(streamResponse);
    const request = new Request("http://dashboard.test/runs/stream");

    const response = await cascadeDashboardApiStreamRequest(request, "/api/runs/stream");

    expect(response).toBe(streamResponse);
    expect(createDashboardApiAuthorizationForRequest).toHaveBeenCalledWith(request);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/runs/stream", {
      headers: {
        "x-cascade-dashboard-authorization": "signed-human-dashboard-auth",
      },
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
  });
});
