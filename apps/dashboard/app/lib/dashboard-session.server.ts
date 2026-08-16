import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@cascade/database";
import { createCookie } from "react-router";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

type DashboardSessionIdentity = {
  id: string;
  userId: string;
  expiresAt: Date;
};

function getDashboardSessionSecret() {
  const secret = process.env.DASHBOARD_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("DASHBOARD_SESSION_SECRET must be at least 32 characters");
  }

  return secret;
}

function getSessionCookie() {
  const production = process.env.NODE_ENV === "production";

  return createCookie(production ? "__Host-cascade-session" : "cascade-session", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: production,
    secrets: [getDashboardSessionSecret()],
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export function hashDashboardSessionToken(token: string) {
  return createHmac("sha256", getDashboardSessionSecret()).update(token).digest("hex");
}

export async function createDashboardSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);

  await prisma.dashboardSession.create({
    data: {
      userId,
      tokenHash: hashDashboardSessionToken(token),
      expiresAt,
    },
  });

  return {
    token,
    expiresAt,
  };
}

export async function commitDashboardSession(token: string) {
  return getSessionCookie().serialize(token);
}

export async function getDashboardSession(
  request: Request,
): Promise<DashboardSessionIdentity | null> {
  const token = await getSessionCookie().parse(request.headers.get("Cookie"));

  if (typeof token !== "string") {
    return null;
  }

  const session = await prisma.dashboardSession.findUnique({
    where: {
      tokenHash: hashDashboardSessionToken(token),
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.dashboardSession.deleteMany({
      where: {
        id: session.id,
      },
    });

    return null;
  }

  return session;
}

export async function destroyDashboardSession(request: Request) {
  const token = await getSessionCookie().parse(request.headers.get("Cookie"));

  if (typeof token === "string") {
    await prisma.dashboardSession.deleteMany({
      where: {
        tokenHash: hashDashboardSessionToken(token),
      },
    });
  }

  return getSessionCookie().serialize("", {
    maxAge: 0,
  });
}
