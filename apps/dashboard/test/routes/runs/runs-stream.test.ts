import { beforeEach, describe, expect, it, vi } from "vitest";

const cascadeDashboardApiStreamRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<Response>>(),
);

vi.mock("~/lib/api/cascade-api.server", () => ({
  cascadeDashboardApiStreamRequest,
}));

const { loader } = await import("../../../app/routes/runs/runs-stream.js");

describe("runs stream proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proxies the environment runs SSE stream", async () => {
    cascadeDashboardApiStreamRequest.mockResolvedValue(
      new Response("event: runs-changed\ndata: {}\n\n", {
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
      request: new Request("http://dashboard.test/runs/stream"),
    } as never);

    expect(cascadeDashboardApiStreamRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/runs/stream",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-internal-header")).toBeNull();

    await expect(response.text()).resolves.toBe("event: runs-changed\ndata: {}\n\n");
  });

  it("forwards an API error response", async () => {
    cascadeDashboardApiStreamRequest.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const response = await loader({
      request: new Request("http://dashboard.test/runs/stream"),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });
});
