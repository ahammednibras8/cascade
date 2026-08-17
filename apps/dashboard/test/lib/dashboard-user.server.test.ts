import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  userIdentity: {
    findUnique: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  user: {
    create: vi.fn<(input: unknown) => Promise<unknown>>(),
    findUnique: vi.fn<(input: unknown) => Promise<unknown>>(),
    update: vi.fn<(input: unknown) => Promise<unknown>>(),
    upsert: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  organization: {
    upsert: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  organizationMember: {
    upsert: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { findOrCreateOidcUser, OidcIdentityLinkRequiredError } =
  await import("../../app/lib/dashboard-user.server.js");

const profile = {
  provider: "https://identity.example.test",
  subject: "identity-user-123",
  email: "nibras@example.test",
  displayName: "Ahammed Nibras",
};

describe("findOrCreateOidcUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.organization.upsert.mockResolvedValue({
      id: "organization-1",
    });
    prisma.organizationMember.upsert.mockResolvedValue({});
  });

  it("creates a user and linked OIDC identity for a first login", async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    await expect(findOrCreateOidcUser(profile)).resolves.toEqual({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        identities: {
          create: {
            provider: profile.provider,
            subject: profile.subject,
          },
        },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });
  });

  it("updates profile data for an already linked identity", async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({
      userId: "user-1",
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
    });
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    await findOrCreateOidcUser(profile);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: {
        id: "user-1",
      },
      data: {
        email: profile.email,
        displayName: profile.displayName,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });
  });

  it("refuses to automatically link an identity to an existing email account", async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      id: "existing-user",
    });

    await expect(findOrCreateOidcUser(profile)).rejects.toBeInstanceOf(
      OidcIdentityLinkRequiredError,
    );

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates an owner membership in the user's personal organization", async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    await findOrCreateOidcUser(profile);

    expect(prisma.organization.upsert).toHaveBeenCalledWith({
      where: {
        slug: "personal-user-1",
      },
      update: {},
      create: {
        slug: "personal-user-1",
        name: "Ahammed Nibras's workspace",
      },
      select: {
        id: true,
      },
    });

    expect(prisma.organizationMember.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: "organization-1",
          userId: "user-1",
        },
      },
      update: {},
      create: {
        organizationId: "organization-1",
        userId: "user-1",
        role: "OWNER",
      },
    });
  });
});
