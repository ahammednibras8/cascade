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
