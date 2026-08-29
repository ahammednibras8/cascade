import { expect, request as playwrightRequest, test, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env["DATABASE_URL"] ??= "postgresql://cascade:cascade@localhost:15432/cascade";

function getBaseURL(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("Playwright base URL is required");
  }

  return baseURL;
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

test("authenticated dashboard loads", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("public landing loads without a dashboard session", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const context = await browser.newContext({
    ...(typeof baseURL === "string" ? { baseURL } : {}),
    storageState: {
      cookies: [],
      origins: [],
    },
  });

  try {
    const page = await context.newPage();
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        name: "Durable tasks you can inspect, replay, and trust.",
      }),
    ).toBeAttached();
    await expect(page.getByText("Background work,")).toBeVisible();
    await expect(page.getByText("built to survive.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("button", { name: "View docs" })).toBeVisible();
    await expect(page.locator("nav")).toHaveCount(0);

    await expect(page.locator("img")).toHaveCount(5);
    const imagesLoaded = await page
      .locator("img")
      .evaluateAll((images) =>
        images.every((image) => Number(Reflect.get(image, "naturalWidth")) > 0),
      );
    expect(imagesLoaded).toBe(true);

    const overflow = await page.evaluate<{ horizontal: number; vertical: number }>(
      `({
        horizontal: document.documentElement.scrollWidth - window.innerWidth,
        vertical: document.documentElement.scrollHeight - window.innerHeight,
      })`,
    );
    expect(overflow.horizontal).toBeLessThanOrEqual(0);
    expect(overflow.vertical).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});

test("anonymous dashboard requests are redirected to login", async ({
  browserName: _browserName,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const anonymousRequest = await playwrightRequest.newContext({
    ...(typeof baseURL === "string" ? { baseURL } : {}),
    storageState: {
      cookies: [],
      origins: [],
    },
  });

  try {
    const response = await anonymousRequest.get("/runs", { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe("/login?returnTo=%2Fruns");
  } finally {
    await anonymousRequest.dispose();
  }
});

test("legacy signup and onboarding routes do not exist", async ({
  browserName: _browserName,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const request = await playwrightRequest.newContext(
    typeof baseURL === "string" ? { baseURL } : {},
  );

  try {
    const responses = await Promise.all(
      ["/signup", "/onboarding"].map((path) => request.get(path)),
    );

    for (const response of responses) {
      expect(response.status()).toBe(404);
    }
  } finally {
    await request.dispose();
  }
});

test("takes a new workspace to credential activation", async ({ browser }, testInfo) => {
  const baseURL = getBaseURL(testInfo);
  const { prisma } = await import("@cascade/database");
  const { commitDashboardSession, createDashboardSession } =
    await import("../../dashboard/app/lib/auth/dashboard-session.server.js");

  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `e2e-workspace-activation-${suffix}@example.test`,
      displayName: "E2E Workspace Activation",
    },
    select: {
      id: true,
    },
  });

  const organization = await prisma.organization.create({
    data: {
      slug: `personal-${user.id}`,
      name: "E2E Workspace Activation",
      members: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
    },
    select: {
      id: true,
    },
  });

  const session = await createDashboardSession(user.id);
  const sessionCookie = getCookieValue(await commitDashboardSession(session.token));
  const context = await browser.newContext({
    baseURL,
  });

  try {
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

    const page = await context.newPage();

    await page.goto("/login?returnTo=/runs");

    await expect(page.getByRole("heading", { name: "Create a workspace" })).toBeVisible();

    await page.getByLabel("Project name").fill("E2E Activated Project");
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page).toHaveURL(/\/login\?returnTo=%2Fruns$/);
    await expect(page.getByRole("heading", { name: "Create an integration key" })).toBeVisible();

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

    await page.goBack();

    await expect(page).toHaveURL(/\/login\?returnTo=%2Fruns$/);
    await expect(
      page.getByRole("heading", { name: "Register your first deployment" }),
    ).toBeVisible();
    await expect(page.locator("pre code")).toContainText("cascade.registerDeployment");

    await expect(page.getByRole("link", { name: "Check deployment" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fruns",
    );

    const project = await prisma.project.findUniqueOrThrow({
      where: {
        slug: `personal-${user.id}-project`,
      },
      include: {
        environments: true,
      },
    });

    expect(project).toMatchObject({
      organizationId: organization.id,
      name: "E2E Activated Project",
      slug: `personal-${user.id}-project`,
    });
    expect(project.environments).toEqual([
      expect.objectContaining({
        slug: "dev",
        name: "Development",
        type: "DEVELOPMENT",
      }),
    ]);

    const cookieNames = (await context.cookies(baseURL)).map((cookie) => cookie.name);

    expect(cookieNames).toEqual(
      expect.arrayContaining(["cascade-active-organization", "cascade-active-environment"]),
    );
  } finally {
    await context.close();

    await prisma.project.deleteMany({
      where: {
        organizationId: organization.id,
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
