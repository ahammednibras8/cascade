import { prisma } from "@cascade/database";
import type { OidcProfile } from "./oidc.server";

export class OidcIdentityLinkRequiredError extends Error {
  constructor() {
    super("An account already exists for this email. Sign in with the originally linked identity");
    this.name = "OidcIdentityLinkRequiredError";
  }
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

    return prisma.user.update({
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

  return prisma.user.create({
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
}

export async function findOrCreateDevDashboardUser() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DASHBOARD_AUTH_MODE=dev cannot be used in production");
  }

  const email = process.env.DASHBOARD_DEV_AUTH_EMAIL?.trim() || "local-dashboard@example.test";
  const displayName = process.env.DASHBOARD_DEV_AUTH_DISPLAY_NAME?.trim() || "Local Dashboard User";

  return prisma.user.upsert({
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
}
