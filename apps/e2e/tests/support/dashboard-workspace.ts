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

  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.waitForLoadState("domcontentloaded");

  await expect(workspaceSelect).toHaveValue(environmentId);
}
