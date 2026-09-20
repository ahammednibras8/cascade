import {
  expect,
  request as playwrightRequest,
  test,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  createActivationApiKey,
  createActivationWorkspace,
  createDashboardActivationFixture,
  disposeDashboardActivationFixture,
  getActivationProject,
  markActivationDeploymentFailed,
  markActivationDeploymentRunning,
  registerActivationDeployment,
  triggerActivationTask,
} from "./support/dashboard-activation.js";
import { startActivationDeploymentWorker } from "./support/deployment-worker.js";

process.env["DATABASE_URL"] ??= "postgresql://cascade:cascade@localhost:15432/cascade";

function getBaseURL(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("Playwright base URL is required");
  }

  return baseURL;
}

async function configureStarterImage(page: Page, suffix: string) {
  const deploymentImage = `ghcr.io/cascade/e2e-activation-${suffix}:0.1.0`;
  const imageInput = page.getByRole("textbox", { name: "Container image" });
  const setupCommands = page.locator("pre code");

  await expect(page.getByRole("button", { name: "Copy setup commands" })).toBeDisabled();
  await imageInput.fill(deploymentImage);
  await expect(page.getByRole("button", { name: "Copy setup commands" })).toBeEnabled();
  await expect(setupCommands).toContainText(
    "git clone --depth 1 https://github.com/ahammednibras8/cascade.git",
  );
  await expect(setupCommands).toContainText(`export CASCADE_DEPLOYMENT_IMAGE="${deploymentImage}"`);
  await expect(setupCommands).toContainText("docker build");
  await expect(setupCommands).toContainText("docker push");
  await expect(setupCommands).toContainText("pnpm run register");
}

test("authenticated dashboard loads", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("sign out revokes the session and offers another account", async ({ browser }, testInfo) => {
  const baseURL = getBaseURL(testInfo);
  const fixture = await createDashboardActivationFixture(browser, baseURL);

  try {
    const page = await fixture.context.newPage();
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/signed-out$/);
    await expect(page.getByRole("heading", { name: "Signed out" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/login",
    );
    await expect(page.getByRole("link", { name: "Use another account" })).toHaveAttribute(
      "href",
      "/auth/start?selectAccount=true",
    );

    const sessionCount = await fixture.prisma.dashboardSession.count({
      where: {
        userId: fixture.userId,
      },
    });
    expect(sessionCount).toBe(0);

    const cookieNames = (await fixture.context.cookies(baseURL)).map((cookie) => cookie.name);
    expect(cookieNames).not.toContain("cascade-session");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard$/);
  } finally {
    await disposeDashboardActivationFixture(fixture);
  }
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

test("login displays only allowlisted authentication errors", async ({ browser }, testInfo) => {
  const baseURL = getBaseURL(testInfo);
  const context = await browser.newContext({
    baseURL,
    storageState: {
      cookies: [],
      origins: [],
    },
  });

  try {
    const page = await context.newPage();

    await page.goto("/login?error=email_not_verified");
    await expect(page.getByRole("alert")).toHaveText(
      "Your identity provider must verify your email address before you can sign in.",
    );

    await page.goto("/login?error=raw-provider-description");
    await expect(page.getByRole("alert")).toHaveCount(0);

    await page.goto("/login?returnTo=%2F%5Cattacker.example.test");
    await expect(page.getByRole("link", { name: "Continue with SSO" })).toHaveAttribute(
      "href",
      "/auth/start?returnTo=%2Fdashboard",
    );
  } finally {
    await context.close();
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

test("activates a new workspace without reloading between setup steps", async ({
  browser,
}, testInfo) => {
  const baseURL = getBaseURL(testInfo);
  const fixture = await createDashboardActivationFixture(browser, baseURL);
  let stopDeploymentWorker: (() => Promise<void>) | undefined;

  try {
    const page = await fixture.context.newPage();
    await createActivationWorkspace(page);
    const apiKey = await createActivationApiKey(page, fixture.suffix);

    expect(apiKey).toMatch(/^csc_/);

    await page.getByRole("button", { name: "I saved the key" }).click();

    await expect(page).toHaveURL(/\/login\?returnTo=\/runs$/);
    await expect(page.getByRole("heading", { name: "Deploy your first task" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(globalThis, "__cascadeCredentialDocument") as unknown),
      )
      .toBe("preserved");
    await configureStarterImage(page, fixture.suffix);

    await expect(page.getByRole("button", { name: "Check deployment" })).toBeVisible();

    const project = await getActivationProject(fixture);
    const environmentId = project.environments[0]?.id ?? "";
    const onboarding = await fixture.prisma.dashboardOnboarding.findUnique({
      where: {
        userId_environmentId: {
          userId: fixture.userId,
          environmentId,
        },
      },
      select: {
        completedAt: true,
      },
    });

    expect(onboarding).toEqual({
      completedAt: null,
    });

    const deployment = await registerActivationDeployment({
      apiKey,
      environmentId,
      suffix: fixture.suffix,
    });
    const activationUrl = page.url();

    await page.evaluate(() => {
      Reflect.set(globalThis, "__cascadeActivationDocument", "preserved");
    });

    await page.getByRole("button", { name: "Check deployment" }).click();

    await expect(page.getByRole("heading", { name: "Starting your deployment" })).toBeVisible();
    await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(activationUrl);
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(globalThis, "__cascadeActivationDocument") as unknown),
      )
      .toBe("preserved");

    const setupProgress = page.getByRole("list", {
      name: "Setup progress",
    });

    const identityStep = setupProgress.getByRole("button", { name: "Verify your identity" });
    const verifiedIdentityHeading = page.getByRole("heading", { name: "Identity verified" });

    await expect(async () => {
      await identityStep.click();
      await expect(verifiedIdentityHeading).toBeVisible({ timeout: 500 });
    }).toPass();
    await expect(page.getByText("E2E Workspace Activation", { exact: true })).toBeVisible();
    await expect(
      page.getByText(`e2e-workspace-activation-${fixture.suffix}@example.test`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Use another account" })).toHaveAttribute(
      "href",
      "/auth/start?selectAccount=true&returnTo=%2Fruns",
    );

    await page.reload();

    await expect(page).toHaveURL(/\/login\?returnTo=\/runs$/);
    await expect(verifiedIdentityHeading).toBeVisible();

    await page.getByRole("button", { name: "Return to setup" }).click();

    await expect(page.getByRole("heading", { name: "Starting your deployment" })).toBeVisible();
    await expect(page.getByText("PENDING", { exact: true })).toBeVisible();

    await setupProgress.getByRole("button", { name: "Create a workspace" }).click();

    await expect(page.getByRole("heading", { name: "Workspace created" })).toBeVisible();

    await page.getByRole("button", { name: "Return to activation" }).click();

    await expect(page.getByRole("heading", { name: "Starting your deployment" })).toBeVisible();
    await expect(page.getByText("PENDING", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();

    await markActivationDeploymentFailed(fixture, deployment.id);

    const deploymentDetailsLink = page.getByRole("link", { name: "Open deployment details" });

    await expect(deploymentDetailsLink).toBeVisible({ timeout: 10_000 });
    await expect(deploymentDetailsLink).toHaveAttribute("href", `/deployments/${deployment.id}`);

    await markActivationDeploymentRunning(fixture, deployment.id);
    await page.getByRole("button", { name: "Check again" }).click();

    await expect(page.getByRole("heading", { name: "Trigger your first run" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login\?returnTo=\/runs$/);
    await expect(page.locator("pre code")).toHaveText("pnpm run trigger");

    const deploymentWorker = await startActivationDeploymentWorker(deployment.id);
    stopDeploymentWorker = deploymentWorker.stop;
    const completedRun = await triggerActivationTask(apiKey);

    expect(completedRun).toMatchObject({
      status: "PENDING",
      taskSlug: "hello",
    });

    await page.evaluate(() => {
      Reflect.set(globalThis, "__cascadeCompletionDocument", "preserved");
    });

    await expect(page).toHaveURL(new RegExp(`/runs/${completedRun.id}$`), { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Run detail" })).toBeVisible();
    await expect(page.locator("body")).toContainText("COMPLETED");
    await expect(page.locator("body")).toContainText("Hello, Cascade!");
    await expect(page.locator("body")).toContainText("Creating greeting");
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(globalThis, "__cascadeCompletionDocument") as unknown),
      )
      .toBe("preserved");

    const completedOnboarding = await fixture.prisma.dashboardOnboarding.findUnique({
      where: {
        userId_environmentId: {
          userId: fixture.userId,
          environmentId,
        },
      },
      select: {
        completedAt: true,
      },
    });

    expect(completedOnboarding?.completedAt).toBeInstanceOf(Date);

    const cookieNames = (await fixture.context.cookies(baseURL)).map((cookie) => cookie.name);

    expect(cookieNames).toEqual(
      expect.arrayContaining(["cascade-active-organization", "cascade-active-environment"]),
    );
  } finally {
    await stopDeploymentWorker?.();
    await disposeDashboardActivationFixture(fixture);
  }
});
