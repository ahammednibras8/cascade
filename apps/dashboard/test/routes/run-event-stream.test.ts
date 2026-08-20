import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiStreamRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<Response>>(),
);

vi.mock("~/lib/cascade-api.server", () => ({
  cascadeDashboardApiStreamRequest,
}));

const { loader } = await import("../../app/routes/run-event-stream.js");

describe("run event stream proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards Last-Event-ID and preserves the SSE response", async () => {
    const eventId = "33333333-3333-4333-8333-333333333333";

    cascadeDashboardApiStreamRequest.mockResolvedValue(
      new Response(`id: ${eventId}\nevent: run-event\ndata: {"eventId":"${eventId}"}\n\n`, {
        status: 200,
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
          "X-Accel-Buffering": "no",
          "X-Internal-Header": "must-not-reach-browser",
        },
      }),
    );

    const response = await loader({
      params: {
        runId: "run-1",
      },
      request: new Request("http://dashboard.test/api/runs/run-1/events/stream", {
        headers: {
          "Last-Event-ID": eventId,
        },
      }),
    } as never);

    expect(cascadeDashboardApiStreamRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/runs/run-1/events/stream",
      {
        headers: {
          "Last-Event-ID": eventId,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-internal-header")).toBeNull();

    await expect(response.text()).resolves.toContain(eventId);
  });

  it("forwards API errors without exposing bearer authorization", async () => {
    cascadeDashboardApiStreamRequest.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "RUN_NOT_FOUND",
            message: "Task run was not found in this environment",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const response = await loader({
      params: {
        runId: "missing-run",
      },
      request: new Request("http://dashboard.test/api/runs/missing-run/events/stream"),
    } as never);

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "RUN_NOT_FOUND",
        message: "Task run was not found in this environment",
      },
    });

    expect(JSON.stringify(cascadeDashboardApiStreamRequest.mock.calls)).not.toContain(
      "Authorization",
    );
  });
});
