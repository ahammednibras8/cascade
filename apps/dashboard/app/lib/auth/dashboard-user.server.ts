import { prisma } from "@cascade/database";
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

async function ensurePersonalOrganization(user: DashboardUser) {
  const organization = await prisma.organization.upsert({
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

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  return user;
}

export async function findOrCreateOidcUser(profile: OidcProfile) {
  const identity = await prisma.userIdentity.findUnique({
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
    const emailOwner = await prisma.user.findUnique({
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

    const user = await prisma.user.update({
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

    return ensurePersonalOrganization(user);
  }

  const existingUser = await prisma.user.findUnique({
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

  const user = await prisma.user.create({
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

  return ensurePersonalOrganization(user);
}

export async function findOrCreateDevDashboardUser() {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("DASHBOARD_AUTH_MODE=dev cannot be used in production");
  }

  const email = process.env["DASHBOARD_DEV_AUTH_EMAIL"]?.trim() || "local-dashboard@example.test";
  const displayName =
    process.env["DASHBOARD_DEV_AUTH_DISPLAY_NAME"]?.trim() || "Local Dashboard User";

  const user = await prisma.user.upsert({
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

  return ensurePersonalOrganization(user);
}
