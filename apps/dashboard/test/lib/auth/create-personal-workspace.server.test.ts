import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  environment: {
    upsert: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  organization: {
    findUniqueOrThrow: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  project: {
    upsert: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

const prisma = vi.hoisted(() => ({
  $transaction:
    vi.fn<(callback: (tx: typeof transaction) => Promise<unknown>) => Promise<unknown>>(),
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { createPersonalWorkspace } =
  await import("../../../app/lib/auth/create-personal-workspace.server.js");

const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const environmentId = "44444444-4444-4444-8444-444444444444";

describe("createPersonalWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.$transaction.mockImplementation((callback) => callback(transaction));
    transaction.organization.findUniqueOrThrow.mockResolvedValue({ id: organizationId });
    transaction.project.upsert.mockResolvedValue({ id: projectId });
    transaction.environment.upsert.mockResolvedValue({ id: environmentId });
  });

  it("creates the user's first project and development environment atomically", async () => {
    await expect(
      createPersonalWorkspace({
        userId,
        projectName: "Cascade",
      }),
    ).resolves.toEqual({
      organizationId,
      projectId,
      environmentId,
    });

    expect(transaction.organization.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        slug: `personal-${userId}`,
      },
      select: {
        id: true,
      },
    });

    expect(transaction.project.upsert).toHaveBeenCalledWith({
      where: {
        slug: `personal-${userId}-project`,
      },
      update: {},
      create: {
        organizationId,
        slug: `personal-${userId}-project`,
        name: "Cascade",
      },
      select: {
        id: true,
      },
    });

    expect(transaction.environment.upsert).toHaveBeenCalledWith({
      where: {
        projectId_slug: {
          projectId,
          slug: "dev",
        },
      },
      update: {},
      create: {
        projectId,
        slug: "dev",
        name: "Development",
        type: "DEVELOPMENT",
      },
      select: {
        id: true,
      },
    });
  });

  it("rejects an empty project name before starting a transaction", async () => {
    await expect(
      createPersonalWorkspace({
        userId,
        projectName: "   ",
      }),
    ).rejects.toThrow("Project name is required");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
