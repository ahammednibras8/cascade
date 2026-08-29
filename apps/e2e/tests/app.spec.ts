import { expect, request as playwrightRequest, test, type TestInfo } from "@playwright/test";
import {
  createActivationApiKey,
  createActivationWorkspace,
  createDashboardActivationFixture,
  disposeDashboardActivationFixture,
  getActivationProject,
  registerActivationDeployment,
} from "./support/dashboard-activation.js";

process.env["DATABASE_URL"] ??= "postgresql://cascade:cascade@localhost:15432/cascade";

function getBaseURL(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("Playwright base URL is required");
  }

  return baseURL;
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
  const fixture = await createDashboardActivationFixture(browser, baseURL);

  try {
    const page = await fixture.context.newPage();
    await createActivationWorkspace(page);
    const apiKey = await createActivationApiKey(page, fixture.suffix);

    expect(apiKey).toMatch(/^csc_/);

    await page.goBack();

    await expect(page).toHaveURL(/\/login\?returnTo=%2Fruns$/);
    await expect(
      page.getByRole("heading", { name: "Register your first deployment" }),
    ).toBeVisible();
    const registrationCode = page.locator("pre code");

    await expect(registrationCode).toContainText("createCascadeClient");
    await expect(registrationCode).toContainText('process.env["CASCADE_API_KEY"]');
    await expect(registrationCode).toContainText("cascade.registerDeployment");

    await expect(page.getByRole("link", { name: "Check deployment" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fruns",
    );

    const project = await getActivationProject(fixture);
    const deployment = await registerActivationDeployment({
      apiKey,
      environmentId: project.environments[0]?.id ?? "",
      suffix: fixture.suffix,
    });

    await page.getByRole("link", { name: "Check deployment" }).click();

    await expect(page).toHaveURL(/\/login\?returnTo=%2Fruns$/);
    await expect(page.getByRole("heading", { name: "Starting your deployment" })).toBeVisible();
    await expect(page.getByText("PENDING", { exact: true })).toBeVisible();

    await expect(page.getByRole("link", { name: "View deployment status" })).toHaveAttribute(
      "href",
      `/deployments/${deployment.id}`,
    );

    const cookieNames = (await fixture.context.cookies(baseURL)).map((cookie) => cookie.name);

    expect(cookieNames).toEqual(
      expect.arrayContaining(["cascade-active-organization", "cascade-active-environment"]),
    );
  } finally {
    await disposeDashboardActivationFixture(fixture);
  }
});
