import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createExecutionConfig } from "./support/execution-config.js";

process.env["DATABASE_URL"] ??= "postgresql://cascade:cascade@localhost:15432/cascade";

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

function getBaseUrl(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("Playwright base URL is required");
  }

  return baseURL;
}

async function createViewerFixture() {
  const { prisma } = await import("@cascade/database");
  const suffix = randomUUID().slice(0, 8);

  const user = await prisma.user.create({
    data: {
      email: `e2e-viewer-${suffix}@example.test`,
      displayName: "E2E Viewer",
    },
  });

  const organization = await prisma.organization.create({
    data: {
      slug: `e2e-viewer-organization-${suffix}`,
      name: "E2E Viewer Organization",
    },
  });

  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      slug: `e2e-viewer-project-${suffix}`,
      name: "E2E Viewer Project",
      environments: {
        create: {
          slug: `e2e-viewer-dev-${suffix}`,
          name: "E2E Viewer Development",
          type: "DEVELOPMENT",
        },
      },
    },
    include: {
      environments: true,
    },
  });

  const environment = project.environments[0];

  if (!environment) {
    throw new Error("E2E viewer environment was not created");
  }

  await prisma.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "VIEWER",
    },
  });

  const executionConfig = createExecutionConfig(`e2e-viewer-task-${suffix}`);

  const task = await prisma.task.create({
    data: {
      environmentId: environment.id,
      slug: `e2e-viewer-task-${suffix}`,
      name: "E2E Viewer Task",
      executionConfig,
    },
  });

  const run = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      status: "PENDING",
      executionConfig,
      payload: {
        source: "viewer-rbac-e2e",
      },
    },
  });

  const schedule = await prisma.taskSchedule.create({
    data: {
      taskId: task.id,
      name: `E2E Viewer Schedule ${suffix}`,
      intervalSeconds: 3600,
      nextRunAt: new Date(Date.now() + 3_600_000),
    },
  });

  return {
    prisma,
    project,
    organization,
    user,
    environment,
    run,
    schedule,
  };
}

async function createViewerContext(browser: Browser, baseURL: string, userId: string) {
  const { commitDashboardSession, createDashboardSession } =
    await import("../../dashboard/app/lib/auth/dashboard-session.server.js");

  const session = await createDashboardSession(userId);
  const cookie = getCookieValue(await commitDashboardSession(session.token));

  const context = await browser.newContext({
    baseURL,
  });

  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      url: baseURL,
      expires: Math.floor(session.expiresAt.getTime() / 1000),
      httpOnly: true,
      secure: baseURL.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);

  return context;
}

async function selectWorkspace(page: Page, environmentId: string) {
  await page.goto("/");

  const workspaceSelect = page.getByRole("combobox", {
    name: "Project and environment",
  });

  await workspaceSelect.selectOption(environmentId);

  await page.locator('form[action="/workspace/select"]').evaluate((form) => {
    (form as { requestSubmit(): void }).requestSubmit();
  });

  await page.waitForLoadState("networkidle");

  await expect(workspaceSelect).toHaveValue(environmentId);
}

async function expectViewerRunAccess(
  page: Page,
  fixture: Awaited<ReturnType<typeof createViewerFixture>>,
) {
  await page.goto(`/runs/${fixture.run.id}`);

  await expect(page.getByRole("heading", { name: "Run detail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel run" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay run" })).toHaveCount(0);

  const cancelResponse = await page.evaluate(async (runId) => {
    const response = await fetch(`/runs/${runId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        intent: "cancel",
      }),
    });

    return {
      status: response.status,
    };
  }, fixture.run.id);

  expect(cancelResponse.status).toBe(403);

  await expect(
    fixture.prisma.taskRun.findUniqueOrThrow({
      where: {
        id: fixture.run.id,
      },
      select: {
        status: true,
      },
    }),
  ).resolves.toEqual({
    status: "PENDING",
  });
}

async function expectViewerScheduleAccess(
  page: Page,
  fixture: Awaited<ReturnType<typeof createViewerFixture>>,
) {
  await page.goto("/schedules");

  await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New schedule" })).toHaveCount(0);

  const scheduleRow = page.getByRole("row").filter({
    hasText: fixture.schedule.id,
  });

  await expect(scheduleRow).toBeVisible();
  await expect(scheduleRow.getByRole("button")).toHaveCount(0);
  await expect(scheduleRow.getByRole("link", { name: "Edit schedule" })).toHaveCount(0);
}

async function expectViewerApiKeyAccess(page: Page) {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Manage API keys" })).toHaveCount(0);

  const apiKeysResponse = await page.goto("/api-keys");

  expect(apiKeysResponse?.status()).toBe(403);
}

async function cleanupViewerFixture(fixture: Awaited<ReturnType<typeof createViewerFixture>>) {
  await fixture.prisma.project.delete({
    where: {
      id: fixture.project.id,
    },
  });

  await fixture.prisma.organization.delete({
    where: {
      id: fixture.organization.id,
    },
  });

  await fixture.prisma.user.delete({
    where: {
      id: fixture.user.id,
    },
  });

  await fixture.prisma.$disconnect();
}

test("viewer can read the dashboard but cannot mutate resources", async ({ browser }, testInfo) => {
  const baseURL = getBaseUrl(testInfo);
  const fixture = await createViewerFixture();
  const context = await createViewerContext(browser, baseURL, fixture.user.id);
  const page = await context.newPage();

  try {
    await selectWorkspace(page, fixture.environment.id);
    await expectViewerRunAccess(page, fixture);
    await expectViewerScheduleAccess(page, fixture);
    await expectViewerApiKeyAccess(page);
  } finally {
    await context.close();
    await cleanupViewerFixture(fixture);
  }
});
