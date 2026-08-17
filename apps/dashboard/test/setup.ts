import { vi } from "vitest";

vi.mock("../app/lib/dashboard-auth.server.js", () => ({
  requireDashboardUser: vi
    .fn<
      () => Promise<{
        id: string;
        userId: string;
        expiresAt: Date;
      }>
    >()
    .mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    }),
}));
