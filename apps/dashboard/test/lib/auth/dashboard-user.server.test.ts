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
  user: {
    findUniqueOrThrow: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const {
  findOrCreateDevDashboardUser,
  findOrCreateOidcUser,
  getDashboardUserIdentitySummary,
  OidcIdentityLinkRequiredError,
} = await import("../../../app/lib/auth/dashboard-user.server.js");

const profile = {
  provider: "https://identity.example.test",
  subject: "identity-user-123",
  email: "nibras@example.test",
  displayName: "Ahammed Nibras",
};

describe("getDashboardUserIdentitySummary", () => {
  it("returns the persisted user and first linked identity provider", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      displayName: profile.displayName,
      email: profile.email,
      identities: [{ provider: profile.provider }],
    });

    await expect(getDashboardUserIdentitySummary("user-1")).resolves.toEqual({
      displayName: profile.displayName,
      email: profile.email,
      provider: profile.provider,
    });

    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        id: "user-1",
      },
      select: {
        displayName: true,
        email: true,
        identities: {
          select: {
            provider: true,
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 1,
        },
      },
    });
  });

  it("returns a null provider for the local development identity", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      displayName: "Local Dashboard User",
      email: "local-dashboard@example.test",
      identities: [],
    });

    await expect(getDashboardUserIdentitySummary("dev-user-1")).resolves.toEqual({
      displayName: "Local Dashboard User",
      email: "local-dashboard@example.test",
      provider: null,
    });
  });
});

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

describe("OIDC provisioning uniqueness conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.organization.upsert.mockResolvedValue({
      id: "organization-1",
    });
    transaction.organizationMember.upsert.mockResolvedValue({});
  });

  it("retries when another request creates the same identity first", async () => {
    prisma.$transaction
      .mockRejectedValueOnce({ code: "P2002" })
      .mockImplementationOnce((callback) => callback(transaction));
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

    await expect(findOrCreateOidcUser(profile)).resolves.toEqual({
      id: "user-1",
      email: profile.email,
      displayName: profile.displayName,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("still refuses a different identity using the concurrently created email", async () => {
    prisma.$transaction
      .mockRejectedValueOnce({ code: "P2002" })
      .mockImplementationOnce((callback) => callback(transaction));
    transaction.userIdentity.findUnique.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue({
      id: "different-user",
    });

    await expect(findOrCreateOidcUser(profile)).rejects.toBeInstanceOf(
      OidcIdentityLinkRequiredError,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it("does not retry unrelated database failures", async () => {
    const failure = new Error("database unavailable");
    prisma.$transaction.mockRejectedValueOnce(failure);

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
