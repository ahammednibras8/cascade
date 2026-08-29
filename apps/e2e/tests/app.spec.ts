import { expect, request as playwrightRequest, test } from "@playwright/test";

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
