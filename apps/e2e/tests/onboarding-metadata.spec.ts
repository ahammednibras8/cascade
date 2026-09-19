import { expect, test, type TestInfo } from "@playwright/test";
import {
  createActivationWorkspace,
  createDashboardActivationFixture,
  disposeDashboardActivationFixture,
  getActivationProject,
} from "./support/dashboard-activation.js";

function getBaseURL(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("Playwright base URL is required");
  }

  return baseURL;
}

test("persists, dismisses, and restarts onboarding presentation metadata", async ({
  browser,
}, testInfo) => {
  const baseURL = getBaseURL(testInfo);
  const fixture = await createDashboardActivationFixture(browser, baseURL);

  try {
    const page = await fixture.context.newPage();
    await createActivationWorkspace(page);

    const project = await getActivationProject(fixture);
    const environmentId = project.environments[0]?.id;

    if (!environmentId) {
      throw new Error("Activation environment was not created");
    }

    const initialMetadata = await fixture.prisma.dashboardOnboarding.findUniqueOrThrow({
      where: {
        userId_environmentId: {
          userId: fixture.userId,
          environmentId,
        },
      },
      select: {
        completedAt: true,
        dismissedAt: true,
        displayedStep: true,
        restartedAt: true,
        selectedSetupPath: true,
        startedAt: true,
      },
    });

    expect(initialMetadata).toMatchObject({
      completedAt: null,
      dismissedAt: null,
      displayedStep: "activation",
      restartedAt: null,
      selectedSetupPath: "sdk",
      startedAt: expect.any(Date),
    });

    const identityStep = page
      .getByRole("list", { name: "Setup progress" })
      .getByRole("button", { name: "Verify your identity" });

    await identityStep.click();
    await expect(page.getByRole("heading", { name: "Identity verified" })).toBeVisible();
    await expect.poll(() => readDisplayedStep(fixture, environmentId)).toBe("authentication");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Identity verified" })).toBeVisible();

    await page.getByRole("button", { name: "Return to setup" }).click();
    await expect(page.getByRole("heading", { name: "Create an integration key" })).toBeVisible();
    await expect.poll(() => readDisplayedStep(fixture, environmentId)).toBe("activation");

    await page.getByRole("button", { name: "Set up later" }).click();
    await expect(page).toHaveURL(/\/runs$/);
    await expect.poll(() => readDismissedAt(fixture, environmentId)).not.toBeNull();

    await page.goto("/login?returnTo=/runs");
    await expect(page).toHaveURL(/\/runs$/);

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Restart setup" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Create an integration key" })).toBeVisible();

    const restartedMetadata = await fixture.prisma.dashboardOnboarding.findUniqueOrThrow({
      where: {
        userId_environmentId: {
          userId: fixture.userId,
          environmentId,
        },
      },
      select: {
        completedAt: true,
        dismissedAt: true,
        displayedStep: true,
        restartedAt: true,
        selectedSetupPath: true,
        startedAt: true,
      },
    });

    expect(restartedMetadata).toMatchObject({
      completedAt: null,
      dismissedAt: null,
      displayedStep: "activation",
      restartedAt: expect.any(Date),
      selectedSetupPath: "sdk",
      startedAt: expect.any(Date),
    });
    expect(restartedMetadata.startedAt).toEqual(restartedMetadata.restartedAt);
    expect(restartedMetadata.startedAt.getTime()).toBeGreaterThan(
      initialMetadata.startedAt.getTime(),
    );
  } finally {
    await disposeDashboardActivationFixture(fixture);
  }
});

async function readDisplayedStep(
  fixture: Awaited<ReturnType<typeof createDashboardActivationFixture>>,
  environmentId: string,
) {
  const onboarding = await fixture.prisma.dashboardOnboarding.findUnique({
    where: {
      userId_environmentId: {
        userId: fixture.userId,
        environmentId,
      },
    },
    select: { displayedStep: true },
  });

  return onboarding?.displayedStep ?? null;
}

async function readDismissedAt(
  fixture: Awaited<ReturnType<typeof createDashboardActivationFixture>>,
  environmentId: string,
) {
  const onboarding = await fixture.prisma.dashboardOnboarding.findUnique({
    where: {
      userId_environmentId: {
        userId: fixture.userId,
        environmentId,
      },
    },
    select: { dismissedAt: true },
  });

  return onboarding?.dismissedAt?.toISOString() ?? null;
}
