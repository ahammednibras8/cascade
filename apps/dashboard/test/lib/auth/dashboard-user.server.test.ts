import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
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

const prisma = vi.hoisted(() => ({
  $transaction:
    vi.fn<(callback: (tx: typeof transaction) => Promise<unknown>) => Promise<unknown>>(),
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { findOrCreateDevDashboardUser, findOrCreateOidcUser, OidcIdentityLinkRequiredError } =
  await import("../../../app/lib/auth/dashboard-user.server.js");

const profile = {
  provider: "https://identity.example.test",
  subject: "identity-user-123",
  email: "nibras@example.test",
  displayName: "Ahammed Nibras",
};

describe("findOrCreateOidcUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.$transaction.mockImplementation((callback) => callback(transaction));
    transaction.organization.upsert.mockResolvedValue({
      id: "organization-1",
    });
    transaction.organizationMember.upsert.mockResolvedValue({});
  });

  it("creates a user and linked OIDC identity for a first login", async () => {
    transaction.userIdentity.findUnique.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue(null);
    transaction.user.create.mockResolvedValue({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    await expect(findOrCreateOidcUser(profile)).resolves.toEqual({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.user.create).toHaveBeenCalledWith({
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
    transaction.userIdentity.findUnique.mockResolvedValue({
      userId: "user-1",
    });
    transaction.user.findUnique.mockResolvedValue({
      id: "user-1",
    });
    transaction.user.update.mockResolvedValue({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    await findOrCreateOidcUser(profile);

    expect(transaction.user.update).toHaveBeenCalledWith({
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
    transaction.userIdentity.findUnique.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue({
      id: "existing-user",
    });

    await expect(findOrCreateOidcUser(profile)).rejects.toBeInstanceOf(
      OidcIdentityLinkRequiredError,
    );

    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it("creates an owner membership in the user's personal organization", async () => {
    transaction.userIdentity.findUnique.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue(null);
    transaction.user.create.mockResolvedValue({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    await findOrCreateOidcUser(profile);

    expect(transaction.organization.upsert).toHaveBeenCalledWith({
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

    expect(transaction.organizationMember.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: "organization-1",
          userId: "user-1",
        },
      },
      update: {
        role: "OWNER",
      },
      create: {
        organizationId: "organization-1",
        userId: "user-1",
        role: "OWNER",
      },
    });
  });
});

describe("OIDC provisioning transaction failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(transaction));
    transaction.userIdentity.findUnique.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue(null);
    transaction.user.create.mockResolvedValue({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });
    transaction.organization.upsert.mockResolvedValue({
      id: "organization-1",
    });
    transaction.organizationMember.upsert.mockResolvedValue({});
  });

  it("rejects the transaction when personal organization provisioning fails", async () => {
    const failure = new Error("organization provisioning failed");
    transaction.organization.upsert.mockRejectedValue(failure);

    await expect(findOrCreateOidcUser(profile)).rejects.toBe(failure);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.organizationMember.upsert).not.toHaveBeenCalled();
  });

  it("rejects the transaction when owner membership provisioning fails", async () => {
    const failure = new Error("membership provisioning failed");
    transaction.organizationMember.upsert.mockRejectedValue(failure);

    await expect(findOrCreateOidcUser(profile)).rejects.toBe(failure);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("findOrCreateDevDashboardUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(transaction));
    transaction.user.upsert.mockResolvedValue({
      id: "dev-user-1",
      email: "local-dashboard@example.test",
      displayName: "Local Dashboard User",
    });
    transaction.organization.upsert.mockResolvedValue({
      id: "organization-1",
    });
    transaction.organizationMember.upsert.mockResolvedValue({});
  });

  it("provisions the development user and personal organization in one transaction", async () => {
    await findOrCreateDevDashboardUser();

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.user.upsert).toHaveBeenCalledOnce();
    expect(transaction.organization.upsert).toHaveBeenCalledOnce();
    expect(transaction.organizationMember.upsert).toHaveBeenCalledOnce();
  });
});
