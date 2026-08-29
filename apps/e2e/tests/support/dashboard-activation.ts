import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createCascadeClient, defineTask } from "@cascade/sdk";
import type { PrismaClient } from "@cascade/database";
import { randomUUID } from "node:crypto";

const apiURL = process.env["CASCADE_API_URL"] ?? "http://localhost:3001";

export type DashboardActivationFixture = {
  context: BrowserContext;
  organizationId: string;
  prisma: PrismaClient;
  suffix: string;
  userId: string;
};

export async function createDashboardActivationFixture(
  browser: Browser,
  baseURL: string,
): Promise<DashboardActivationFixture> {
  const { prisma } = await import("@cascade/database");
  const { commitDashboardSession, createDashboardSession } =
    await import("../../../dashboard/app/lib/auth/dashboard-session.server.js");
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `e2e-workspace-activation-${suffix}@example.test`,
      displayName: "E2E Workspace Activation",
    },
    select: { id: true },
  });
  const organization = await prisma.organization.create({
    data: {
      slug: `personal-${user.id}`,
      name: "E2E Workspace Activation",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    select: { id: true },
  });
  const session = await createDashboardSession(user.id);
  const sessionCookie = getCookieValue(await commitDashboardSession(session.token));
  const context = await browser.newContext({ baseURL });

  await context.addCookies([
    {
      name: sessionCookie.name,
      value: sessionCookie.value,
      url: baseURL,
      expires: Math.floor(session.expiresAt.getTime() / 1000),
      httpOnly: true,
      secure: baseURL.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);

  return {
    context,
    organizationId: organization.id,
    prisma,
    suffix,
    userId: user.id,
  };
}

export async function disposeDashboardActivationFixture(fixture: DashboardActivationFixture) {
  await fixture.context.close();
  await fixture.prisma.project.deleteMany({
    where: { organizationId: fixture.organizationId },
  });
  await fixture.prisma.organization.delete({
    where: { id: fixture.organizationId },
  });
  await fixture.prisma.user.delete({
    where: { id: fixture.userId },
  });
  await fixture.prisma.$disconnect();
}

export async function createActivationWorkspace(page: Page) {
  await page.goto("/login?returnTo=/runs");
  await expect(page.getByRole("heading", { name: "Create a workspace" })).toBeVisible();
  await page.getByLabel("Project name").fill("E2E Activated Project");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fruns$/);
  await expect(page.getByRole("heading", { name: "Create an integration key" })).toBeVisible();
}

export async function createActivationApiKey(page: Page, suffix: string) {
  await expect(page.getByRole("link", { name: "Create API key" })).toHaveAttribute(
    "href",
    "/api-keys",
  );
  await page.getByRole("link", { name: "Create API key" }).click();
  await expect(page).toHaveURL(/\/api-keys$/);
  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
  await page.getByRole("textbox", { name: "Name" }).fill(`E2E activation key ${suffix}`);

  await page.locator('input[name="scope"][value="DEPLOYMENTS_WRITE"]').check();
  await page.locator('input[name="scope"][value="TASKS_TRIGGER"]').check();
  await page.locator('input[name="scope"][value="RUNS_READ"]').check();

  await page.getByRole("button", { name: "Create API key" }).click();
  await expect(page.getByRole("heading", { name: "Copy this API key now" })).toBeVisible();

  return page.locator("section[aria-labelledby='new-api-key-heading'] code").innerText();
}

export async function getActivationProject(fixture: DashboardActivationFixture) {
  const project = await fixture.prisma.project.findUniqueOrThrow({
    where: { slug: `personal-${fixture.userId}-project` },
    include: { environments: true },
  });

  expect(project).toMatchObject({
    organizationId: fixture.organizationId,
    name: "E2E Activated Project",
    slug: `personal-${fixture.userId}-project`,
  });
  expect(project.environments).toEqual([
    expect.objectContaining({ slug: "dev", name: "Development", type: "DEVELOPMENT" }),
  ]);

  return project;
}

export async function registerActivationDeployment({
  apiKey,
  environmentId,
  suffix,
}: {
  apiKey: string;
  environmentId: string;
  suffix: string;
}) {
  const task = defineTask({
    id: `e2e-activation-task-${suffix}`,
    run() {
      return { ok: true };
    },
  });
  const cascade = createCascadeClient({ baseUrl: apiURL, apiKey });
  const deployment = await cascade.registerDeployment({
    version: `e2e-activation-${suffix}`,
    image: "ghcr.io/cascade/e2e-activation:v1",
    tasks: [{ task, name: "E2E activation task" }],
  });

  expect(deployment).toMatchObject({
    environmentId,
    status: "ACTIVE",
    version: `e2e-activation-${suffix}`,
    image: "ghcr.io/cascade/e2e-activation:v1",
    tasks: [{ slug: `e2e-activation-task-${suffix}`, name: "E2E activation task" }],
  });

  return deployment;
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
