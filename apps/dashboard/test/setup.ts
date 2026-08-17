import { vi } from "vitest";

vi.mock("../app/lib/dashboard-auth.server.js", () => ({
  requireDashboardUser: vi
    .fn<
      () => Promise<{
        id: string;
        email: string;
        displayName: string;
      }>
    >()
    .mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "dashboard@example.test",
      displayName: "Dashboard User",
    }),
}));
