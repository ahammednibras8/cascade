import { expect, request as playwrightRequest, test } from "@playwright/test";

test("authenticated application loads", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
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
    expect(response.headers().location).toBe("/login?returnTo=%2Fruns");
  } finally {
    await anonymousRequest.dispose();
  }
});
