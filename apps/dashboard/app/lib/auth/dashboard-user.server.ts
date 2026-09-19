import { Prisma, prisma } from "@cascade/database";
import type { OidcProfile } from "./oidc.server";

export class OidcIdentityLinkRequiredError extends Error {
  constructor() {
    super("An account already exists for this email. Sign in with the originally linked identity");
    this.name = "OidcIdentityLinkRequiredError";
  }
}

type DashboardUser = {
  id: string;
  email: string;
  displayName: string | null;
};

type DashboardUserTransaction = Prisma.TransactionClient;

export type DashboardUserIdentitySummary = {
  displayName: string | null;
  email: string;
  provider: string | null;
};

export async function getDashboardUserIdentitySummary(
  userId: string,
): Promise<DashboardUserIdentitySummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id: userId,
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

  return {
    displayName: user.displayName,
    email: user.email,
    provider: user.identities[0]?.provider ?? null,
  };
}

async function ensurePersonalOrganization(tx: DashboardUserTransaction, user: DashboardUser) {
  const organization = await tx.organization.upsert({
    where: {
      slug: `personal-${user.id}`,
    },
    update: {},
    create: {
      slug: `personal-${user.id}`,
      name: `${user.displayName ?? user.email}'s workspace`,
    },
    select: {
      id: true,
    },
  });

  await tx.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: {
      role: "OWNER",
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  return user;
}

async function findOrCreateOidcUserInTransaction(
  tx: DashboardUserTransaction,
  profile: OidcProfile,
) {
  const identity = await tx.userIdentity.findUnique({
    where: {
      provider_subject: {
        provider: profile.provider,
        subject: profile.subject,
      },
    },
    select: {
      userId: true,
    },
  });

  if (identity) {
    const emailOwner = await tx.user.findUnique({
      where: {
        email: profile.email,
      },
      select: {
        id: true,
      },
    });

    if (emailOwner && emailOwner.id !== identity.userId) {
      throw new OidcIdentityLinkRequiredError();
    }

    const user = await tx.user.update({
      where: {
        id: identity.userId,
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

    return ensurePersonalOrganization(tx, user);
  }

  const existingUser = await tx.user.findUnique({
    where: {
      email: profile.email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    throw new OidcIdentityLinkRequiredError();
  }

  const user = await tx.user.create({
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

  return ensurePersonalOrganization(tx, user);
}

function isUniqueConstraintViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function provisionOidcUser(profile: OidcProfile) {
  return prisma.$transaction((tx) => findOrCreateOidcUserInTransaction(tx, profile));
}

export async function findOrCreateOidcUser(profile: OidcProfile) {
  try {
    return await provisionOidcUser(profile);
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
  }

  try {
    return await provisionOidcUser(profile);
  } catch (error) {
    if (error instanceof OidcIdentityLinkRequiredError || !isUniqueConstraintViolation(error)) {
      throw error;
    }

    throw new OidcIdentityLinkRequiredError();
  }
}

export async function findOrCreateDevDashboardUser() {
  const email = process.env["DASHBOARD_DEV_AUTH_EMAIL"]?.trim() || "local-dashboard@example.test";
  const displayName =
    process.env["DASHBOARD_DEV_AUTH_DISPLAY_NAME"]?.trim() || "Local Dashboard User";

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: {
        email,
      },
      update: {
        displayName,
      },
      create: {
        email,
        displayName,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });

    return ensurePersonalOrganization(tx, user);
  });
}
