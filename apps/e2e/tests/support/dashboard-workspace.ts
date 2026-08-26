import { expect, type Page } from "@playwright/test";

export async function selectDashboardWorkspace(page: Page, environmentId: string) {
  await page.goto("/dashboard");

  const workspaceSelect = page.getByRole("combobox", {
    name: "Project and environment",
  });
  const targetWorkspaceOption = workspaceSelect.locator(`option[value="${environmentId}"]`);

  await expect(workspaceSelect).toBeVisible();
  await expect(targetWorkspaceOption).toHaveCount(1);

  const workspace = await targetWorkspaceOption.evaluate((option) => {
    const element = option as unknown as {
      parentElement?: {
        getAttribute?: (name: string) => string | null;
        label?: string;
      } | null;
      text?: string;
      textContent?: string | null;
    };
    const environmentLabel = element.text ?? element.textContent ?? "";
    const optgroup = element.parentElement;

    return {
      environmentName: environmentLabel.replace(/\s+\([^)]+\)\s*$/, "").trim(),
      projectName: optgroup?.getAttribute?.("label") ?? optgroup?.label ?? "",
    };
  });

  if ((await workspaceSelect.inputValue()) === environmentId) {
    return;
  }

  await workspaceSelect.selectOption(environmentId);
  await expect(workspaceSelect).toHaveValue(environmentId);

  await page.getByRole("button", { name: "Switch workspace" }).click();
  await expect(page.locator("body")).toContainText(
    `Active environment: ${workspace.environmentName}`,
  );

  if (workspace.projectName) {
    await expect(page.locator("body")).toContainText(`Active project: ${workspace.projectName}`);
  }
}
