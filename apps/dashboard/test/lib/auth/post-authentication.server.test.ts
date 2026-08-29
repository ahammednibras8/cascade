import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  environment: {
    findFirst: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { resolvePostAuthenticationRedirect } =
  await import("../../../app/lib/auth/post-authentication.server.js");

describe("post-authentication redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a user without a usable workspace in the login flow", async () => {
    prisma.environment.findFirst.mockResolvedValue(null);

    await expect(resolvePostAuthenticationRedirect("user-1", "/dashboard")).resolves.toBe("/login");

    expect(prisma.environment.findFirst).toHaveBeenCalledWith({
      where: {
        project: {
          organization: {
            members: {
              some: {
                userId: "user-1",
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("preserves the requested internal route for a user with a workspace", async () => {
    prisma.environment.findFirst.mockResolvedValue({ id: "environment-1" });

    await expect(resolvePostAuthenticationRedirect("user-1", "/runs")).resolves.toBe("/runs");
  });

  it("rejects an external return URL for a user with a workspace", async () => {
    prisma.environment.findFirst.mockResolvedValue({ id: "environment-1" });

    await expect(
      resolvePostAuthenticationRedirect("user-1", "https://attacker.example.test"),
    ).resolves.toBe("/dashboard");
  });
});
