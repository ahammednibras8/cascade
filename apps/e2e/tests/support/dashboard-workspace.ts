import { expect, type Page } from "@playwright/test";

export async function selectDashboardWorkspace(page: Page, environmentId: string) {
  await page.goto("/");

  const workspaceSelect = page.getByRole("combobox", {
    name: "Project and environment",
  });
  const targetWorkspaceOption = workspaceSelect.locator(`option[value="${environmentId}"]`);

  await expect(workspaceSelect).toBeVisible();
  await expect(targetWorkspaceOption).toHaveCount(1);
  await workspaceSelect.selectOption(environmentId);
  await expect(workspaceSelect).toHaveValue(environmentId);

  await page.locator('form[action="/workspace/select"]').evaluate((form) => {
    (form as { requestSubmit(): void }).requestSubmit();
  });
  await page.waitForLoadState("networkidle");

  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });

  await expect(workspaceSelect).toHaveValue(environmentId);
}
