import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cascadeApiRequest } = await import("../../app/lib/cascade-api.server.js");

const originalApiUrl = process.env.CASCADE_API_URL;
const originalApiKey = process.env.CASCADE_DASHBOARD_API_KEY;

const fetchMock = vi.fn<typeof fetch>();

function mockJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

describe("cascadeApiRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);

    process.env.CASCADE_API_URL = "http://localhost:3001/";
    process.env.CASCADE_DASHBOARD_API_KEY = "csc_dashboard_test_key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    process.env.CASCADE_API_URL = originalApiUrl;
    process.env.CASCADE_DASHBOARD_API_KEY = originalApiKey;
  });

  it("calls the Cascade API with dashboard authorization and returns JSON", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        tasks: [],
      }),
    );

    const body = await cascadeApiRequest<{ tasks: unknown[] }>("/api/tasks");

    expect(body).toEqual({
      tasks: [],
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/tasks", {
      headers: {
        Authorization: "Bearer csc_dashboard_test_key",
      },
    });
  });

  it("merges caller headers without dropping dashboard authorization", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        taskRun: {
          id: "run-1",
        },
      }),
    );

    await cascadeApiRequest("/api/runs/run-1/cancel", {
      method: "POST",
      headers: {
        "Idempotency-Key": "cancel-1",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/runs/run-1/cancel", {
      method: "POST",
      headers: {
        Authorization: "Bearer csc_dashboard_test_key",
        "Idempotency-Key": "cancel-1",
      },
    });
  });

  it("includes API error status, code, message, and response body", async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          },
        },
        {
          status: 401,
        },
      ),
    );

    await expect(cascadeApiRequest("/api/tasks")).rejects.toMatchObject({
      name: "CascadeApiError",
      status: 401,
      message: "Cascade API request failed (401 UNAUTHORIZED): Invalid API key",
      responseBody: {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid API key",
        },
      },
    });
  });

  it("handles non-JSON error responses", async () => {
    fetchMock.mockResolvedValue(
      new Response("not found", {
        status: 404,
      }),
    );

    await expect(cascadeApiRequest("/missing")).rejects.toMatchObject({
      name: "CascadeApiError",
      status: 404,
      message: "Cascade API request failed (404)",
      responseBody: "not found",
    });
  });
});
