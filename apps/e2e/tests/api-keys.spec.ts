import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getDashboardTestEnvironment } from "./support/dashboard-environment.js";
import { selectDashboardWorkspace } from "./support/dashboard-workspace.js";

process.env.DATABASE_URL ??= "postgresql://cascade:cascade@localhost:15432/cascade";

const createdApiKeyNames: string[] = [];

async function getPrisma() {
  const { prisma } = await import("@cascade/database");
  return prisma;
}

test.afterEach(async () => {
  const prisma = await getPrisma();
  const names = createdApiKeyNames.splice(0);

  if (names.length > 0) {
    await prisma.apiKey.deleteMany({
      where: {
        name: {
          in: names,
        },
      },
    });
  }
});

test.afterAll(async () => {
  const prisma = await getPrisma();
  await prisma.$disconnect();
});

test("dashboard creates a scoped API key that can call the API", async ({ page, request }) => {
  const prisma = await getPrisma();
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const name = `E2E API key ${randomUUID().slice(0, 8)}`;
  createdApiKeyNames.push(name);

  await page.goto("/api-keys");

  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill(name);

  await page.locator('input[name="scope"][value="API_KEYS_MANAGE"]').check();

  await page.getByRole("button", { name: "Create API key" }).click();

  await expect(page.getByRole("heading", { name: "Copy this API key now" })).toBeVisible();

  const token = await page
    .locator("section[aria-labelledby='new-api-key-heading'] code")
    .innerText();

  expect(token).toMatch(/^csc_/);

  const apiUrl = process.env.CASCADE_API_URL ?? "http://localhost:3001";

  const response = await request.get(`${apiUrl}/api/api-keys`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.apiKeys).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name,
        scopes: ["API_KEYS_MANAGE"],
      }),
    ]),
  );

  const storedKey = await prisma.apiKey.findFirstOrThrow({
    where: {
      environmentId: environment.id,
      name,
    },
    select: {
      lastUsedAt: true,
    },
  });

  expect(storedKey.lastUsedAt).not.toBeNull();
});

test("dashboard rotation immediately invalidates the old API key", async ({ page, request }) => {
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const name = `E2E rotated API key ${randomUUID().slice(0, 8)}`;
  createdApiKeyNames.push(name);

  await page.goto("/api-keys");

  await page.getByRole("textbox", { name: "Name" }).fill(name);

  await page.locator('input[name="scope"][value="API_KEYS_MANAGE"]').check();

  await page.getByRole("button", { name: "Create API key" }).click();

  const revealedToken = page.locator("section[aria-labelledby='new-api-key-heading'] code");

  await expect(revealedToken).toBeVisible();

  const oldToken = await revealedToken.innerText();

  const row = page.getByRole("row").filter({
    hasText: name,
  });

  await expect(row).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());

  await row.getByRole("button", { name: "Rotate" }).click();

  await expect(revealedToken).not.toHaveText(oldToken);

  const newToken = await revealedToken.innerText();

  expect(newToken).toMatch(/^csc_/);
  expect(newToken).not.toBe(oldToken);

  const apiUrl = process.env.CASCADE_API_URL ?? "http://localhost:3001";

  const oldKeyResponse = await request.get(`${apiUrl}/api/api-keys`, {
    headers: {
      Authorization: `Bearer ${oldToken}`,
    },
  });

  expect(oldKeyResponse.status()).toBe(401);

  const newKeyResponse = await request.get(`${apiUrl}/api/api-keys`, {
    headers: {
      Authorization: `Bearer ${newToken}`,
    },
  });

  expect(newKeyResponse.status()).toBe(200);
});

test("dashboard revocation immediately invalidates an API key", async ({ page, request }) => {
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const name = `E2E revoked API key ${randomUUID().slice(0, 8)}`;
  createdApiKeyNames.push(name);

  await page.goto("/api-keys");

  await page.getByRole("textbox", { name: "Name" }).fill(name);

  await page.locator('input[name="scope"][value="API_KEYS_MANAGE"]').check();

  await page.getByRole("button", { name: "Create API key" }).click();

  const token = await page
    .locator("section[aria-labelledby='new-api-key-heading'] code")
    .innerText();

  const row = page.getByRole("row").filter({
    hasText: name,
  });

  await expect(row).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());

  await row.getByRole("button", { name: "Revoke" }).click();

  await expect(row).toContainText("Revoked");
  await expect(row).not.toHaveText("Rotate");
  await expect(row).not.toHaveText("Revoke");

  const apiUrl = process.env.CASCADE_API_URL ?? "http://localhost:3001";

  const response = await request.get(`${apiUrl}/api/api-keys`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(response.status()).toBe(401);
});

test("a key can use only its selected permission", async ({ page, request }) => {
  const { environment } = await getDashboardTestEnvironment();

  await selectDashboardWorkspace(page, environment.id);

  const name = `E2E runs-read key ${randomUUID().slice(0, 8)}`;
  createdApiKeyNames.push(name);

  await page.goto("/api-keys");

  await page.getByRole("textbox", { name: "Name" }).fill(name);

  await page.locator('input[name="scope"][value="RUNS_READ"]').check();

  await page.getByRole("button", { name: "Create API key" }).click();

  const token = await page
    .locator("section[aria-labelledby='new-api-key-heading'] code")
    .innerText();

  const row = page.getByRole("row").filter({
    hasText: name,
  });

  await expect(row).toBeVisible();
  await expect(row).toContainText("RUNS_READ");

  const apiUrl = process.env.CASCADE_API_URL ?? "http://localhost:3001";

  const runsResponse = await request.get(`${apiUrl}/api/runs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(runsResponse.status()).toBe(200);

  const apiKeysResponse = await request.get(`${apiUrl}/api/api-keys`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(apiKeysResponse.status()).toBe(403);

  await expect(apiKeysResponse.json()).resolves.toMatchObject({
    error: {
      code: "FORBIDDEN",
    },
  });
});
