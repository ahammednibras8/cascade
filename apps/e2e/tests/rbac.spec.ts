import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createExecutionConfig } from "./support/execution-config.js";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

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

test("viewer can read the dashboard but cannot mutate resources", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("Playwright base URL is required");
  }

  const { prisma } = await import("@cascade/database");
  const { commitDashboardSession, createDashboardSession } =
    await import("../../dashboard/app/lib/auth/dashboard-session.server.js");

  const suffix = randomUUID().slice(0, 8);
  const userEmail = `e2e-viewer-${suffix}@example.test`;

  const user = await prisma.user.create({
    data: {
      email: userEmail,
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

  const session = await createDashboardSession(user.id);
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

  const page = await context.newPage();

  try {
    await page.goto("/");

    const workspaceSelect = page.getByRole("combobox", {
      name: "Project and environment",
    });

    await workspaceSelect.selectOption(environment.id);

    await page.locator('form[action="/workspace/select"]').evaluate((form) => {
      (form as { requestSubmit(): void }).requestSubmit();
    });

    await page.waitForLoadState("networkidle");

    await expect(workspaceSelect).toHaveValue(environment.id);

    await page.goto(`/runs/${run.id}`);

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
    }, run.id);

    expect(cancelResponse.status).toBe(403);

    await expect(
      prisma.taskRun.findUniqueOrThrow({
        where: {
          id: run.id,
        },
        select: {
          status: true,
        },
      }),
    ).resolves.toEqual({
      status: "PENDING",
    });

    await page.goto("/schedules");

    await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New schedule" })).toHaveCount(0);

    const scheduleRow = page.getByRole("row").filter({
      hasText: schedule.id,
    });

    await expect(scheduleRow).toBeVisible();
    await expect(scheduleRow.getByRole("button")).toHaveCount(0);
    await expect(scheduleRow.getByRole("link", { name: "Edit schedule" })).toHaveCount(0);

    await page.goto("/");

    await expect(page.getByRole("link", { name: "Manage API keys" })).toHaveCount(0);

    const apiKeysResponse = await page.goto("/api-keys");

    expect(apiKeysResponse?.status()).toBe(403);
  } finally {
    await context.close();

    await prisma.project.delete({
      where: {
        id: project.id,
      },
    });

    await prisma.organization.delete({
      where: {
        id: organization.id,
      },
    });

    await prisma.user.delete({
      where: {
        id: user.id,
      },
    });

    await prisma.$disconnect();
  }
});
