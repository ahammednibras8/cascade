import { beforeEach, expect, it, vi } from "vitest";

const cascadeDashboardApiRequest = vi.hoisted(() =>
  vi.fn<(request: Request, path: string, init?: RequestInit) => Promise<unknown>>(),
);

const requireDashboardCapability = vi.hoisted(() =>
  vi.fn<(request: Request, capability: string) => Promise<unknown>>(),
);

const getDashboardWorkspaceContext = vi.hoisted(() =>
  vi.fn<(request: Request, userId: string) => Promise<unknown>>(),
);

vi.mock("~/lib/api/cascade-api.server", () => ({
  cascadeDashboardApiRequest,
}));

vi.mock("~/lib/auth/dashboard-permissions.server", () => ({
  requireDashboardCapability,
}));

vi.mock("~/lib/workspace/dashboard-workspace.server", () => ({
  getDashboardWorkspaceContext,
}));

const { action, loader } = await import("../../../app/routes/schedules/schedules.js");

function actionRequest(input: Record<string, string>) {
  return new Request("http://dashboard.test/schedules", {
    method: "POST",
    body: new URLSearchParams(input),
  });
}

const SCHEDULE_ID = "schedule-1";

beforeEach(() => {
  vi.clearAllMocks();
  requireDashboardCapability.mockResolvedValue({});
  getDashboardWorkspaceContext.mockResolvedValue({
    activeOrganization: {
      role: "OWNER",
    },
  });
});

it("returns schedules from the Cascade API", async () => {
  cascadeDashboardApiRequest.mockResolvedValue({
    schedules: [
      {
        id: "schedule-1",
        taskId: "task-1",
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        nextRunAt: "2026-01-05T03:30:00.000Z",
        lastRunAt: null,
        enabled: true,
        hasPayload: true,
        revision: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        task: {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          deployment: {
            id: "deployment-1",
            version: "v1",
            status: "ACTIVE",
          },
        },
      },
    ],
  });

  await expect(
    loader({ request: new Request("http://dashboard.test/schedules") } as never),
  ).resolves.toEqual({
    schedules: [
      expect.objectContaining({
        id: "schedule-1",
        scheduleType: "CRON",
        task: expect.objectContaining({
          slug: "hello",
        }),
      }),
    ],
    role: "OWNER",
  });

  expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(expect.any(Request), "/api/schedules");
});

it("returns an empty list when the API has no schedules", async () => {
  cascadeDashboardApiRequest.mockResolvedValue({
    schedules: [],
  });

  await expect(
    loader({ request: new Request("http://dashboard.test/schedules") } as never),
  ).resolves.toEqual({
    schedules: [],
    role: "OWNER",
  });
});

it("calls the API pause endpoint", async () => {
  cascadeDashboardApiRequest.mockResolvedValue({
    schedule: {
      id: SCHEDULE_ID,
    },
  });

  await expect(
    action({
      request: actionRequest({
        intent: "pause",
        scheduleId: SCHEDULE_ID,
      }),
      params: {},
      context: {},
    } as never),
  ).resolves.toEqual({
    ok: true,
    intent: "pause",
    scheduleId: SCHEDULE_ID,
  });

  expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
    expect.any(Request),
    `/api/schedules/${SCHEDULE_ID}/pause`,
    {
      method: "POST",
    },
  );
  expect(requireDashboardCapability).toHaveBeenCalledWith(expect.any(Request), "SCHEDULES_MANAGE");
});

it("calls the API resume endpoint", async () => {
  cascadeDashboardApiRequest.mockResolvedValue({
    schedule: {
      id: SCHEDULE_ID,
    },
  });

  await action({
    request: actionRequest({
      intent: "resume",
      scheduleId: SCHEDULE_ID,
    }),
    params: {},
    context: {},
  } as never);

  expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
    expect.any(Request),
    `/api/schedules/${SCHEDULE_ID}/resume`,
    {
      method: "POST",
    },
  );
  expect(requireDashboardCapability).toHaveBeenCalledWith(expect.any(Request), "SCHEDULES_MANAGE");
});

it("calls the API delete endpoint", async () => {
  cascadeDashboardApiRequest.mockResolvedValue(null);

  await action({
    request: actionRequest({
      intent: "delete",
      scheduleId: SCHEDULE_ID,
    }),
    params: {},
    context: {},
  } as never);

  expect(cascadeDashboardApiRequest).toHaveBeenCalledWith(
    expect.any(Request),
    `/api/schedules/${SCHEDULE_ID}`,
    {
      method: "DELETE",
    },
  );
  expect(requireDashboardCapability).toHaveBeenCalledWith(expect.any(Request), "SCHEDULES_MANAGE");
});

it("rejects invalid dashboard schedule actions", async () => {
  await expect(
    action({
      request: actionRequest({
        intent: "unknown",
        scheduleId: SCHEDULE_ID,
      }),
      params: {},
      context: {},
    } as never),
  ).rejects.toMatchObject({
    status: 400,
  });

  expect(cascadeDashboardApiRequest).not.toHaveBeenCalled();
  expect(requireDashboardCapability).toHaveBeenCalledWith(expect.any(Request), "SCHEDULES_MANAGE");
});

it("does not call the API when schedule management permission is denied", async () => {
  requireDashboardCapability.mockRejectedValueOnce(
    new Response("Forbidden", {
      status: 403,
    }),
  );

  await expect(
    action({
      request: actionRequest({
        intent: "pause",
        scheduleId: SCHEDULE_ID,
      }),
      params: {},
      context: {},
    } as never),
  ).rejects.toMatchObject({
    status: 403,
  });

  expect(requireDashboardCapability).toHaveBeenCalledWith(expect.any(Request), "SCHEDULES_MANAGE");
  expect(cascadeDashboardApiRequest).not.toHaveBeenCalled();
});
