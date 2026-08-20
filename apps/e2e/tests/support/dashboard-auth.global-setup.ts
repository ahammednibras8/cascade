import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FullConfig } from "@playwright/test";

const TEST_USER_EMAIL = "playwright-dashboard@example.test";
const TEST_USER_DISPLAY_NAME = "Playwright Dashboard User";

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Playwright dashboard authentication`);
  }

  return value;
}

function getCookieValue(setCookie: string) {
  const firstPart = setCookie.split(";")[0];

  if (!firstPart) {
    throw new Error("Dashboard session cookie is missing");
  }

  const separatorIndex = firstPart.indexOf("=");

  if (separatorIndex === -1) {
    throw new Error("Dashboard session cookie is invalid");
  }

  return {
    name: firstPart.slice(0, separatorIndex),
    value: firstPart.slice(separatorIndex + 1),
  };
}

export default async function setup(_config: FullConfig) {
  process.env.NODE_ENV = "test";

  const storageStatePath = getRequiredEnvironmentVariable("PLAYWRIGHT_DASHBOARD_STORAGE_STATE");
  const baseUrl = new URL(getRequiredEnvironmentVariable("PLAYWRIGHT_BASE_URL"));

  const { prisma } = await import("@cascade/database");
  const { commitDashboardSession, createDashboardSession } =
    await import("../../../dashboard/app/lib/auth/dashboard-session.server.js");

  const user = await prisma.user.upsert({
    where: {
      email: TEST_USER_EMAIL,
    },
    update: {
      displayName: TEST_USER_DISPLAY_NAME,
    },
    create: {
      email: TEST_USER_EMAIL,
      displayName: TEST_USER_DISPLAY_NAME,
    },
    select: {
      id: true,
    },
  });

  const organization = await prisma.organization.upsert({
    where: {
      slug: "playwright-dashboard",
    },
    update: {},
    create: {
      slug: "playwright-dashboard",
      name: "Playwright Dashboard",
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

  await prisma.dashboardSession.deleteMany({
    where: {
      userId: user.id,
    },
  });

  const session = await createDashboardSession(user.id);
  const setCookie = await commitDashboardSession(session.token);
  const cookie = getCookieValue(setCookie);

  await mkdir(dirname(storageStatePath), {
    recursive: true,
  });

  await writeFile(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [
          {
            name: cookie.name,
            value: cookie.value,
            domain: baseUrl.hostname,
            path: "/",
            expires: Math.floor(session.expiresAt.getTime() / 1000),
            httpOnly: true,
            secure: baseUrl.protocol === "https:",
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}
