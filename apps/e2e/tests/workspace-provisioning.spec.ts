import { expect, test, type TestInfo } from "@playwright/test";
import {
  createDashboardActivationFixture,
  disposeDashboardActivationFixture,
} from "./support/dashboard-activation.js";

function getBaseURL(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("Playwright base URL is required");
  }

  return baseURL;
}

test("workspace provisioning is idempotent against concurrent submissions", async ({
  browser,
}, testInfo) => {
  const baseURL = getBaseURL(testInfo);
  const fixture = await createDashboardActivationFixture(browser, baseURL);

  try {
    const page = await fixture.context.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Create a workspace" })).toBeVisible();

    const responses = await page.evaluate(async () => {
      const request = {
        method: "POST",
        credentials: "same-origin" as const,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          intent: "create_workspace",
          projectName: "Concurrent Workspace",
        }),
      };
      const fetchedResponses = await Promise.all([
        fetch("/login", request),
        fetch("/login", request),
      ]);

      return fetchedResponses.map((response) => ({
        contentType: response.headers.get("Content-Type"),
        status: response.status,
      }));
    });

    expect(responses).toEqual([
      expect.objectContaining({
        contentType: expect.stringContaining("text/html"),
        status: 200,
      }),
      expect.objectContaining({
        contentType: expect.stringContaining("text/html"),
        status: 200,
      }),
    ]);

    const projects = await fixture.prisma.project.findMany({
      where: { organizationId: fixture.organizationId },
      include: {
        environments: {
          include: {
            onboardingRecords: {
              where: { userId: fixture.userId },
            },
          },
        },
      },
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: "Concurrent Workspace",
      organizationId: fixture.organizationId,
      environments: [
        expect.objectContaining({
          name: "Development",
          slug: "dev",
          type: "DEVELOPMENT",
          onboardingRecords: [expect.objectContaining({ userId: fixture.userId })],
        }),
      ],
    });

    const cookieNames = (await fixture.context.cookies(baseURL)).map(({ name }) => name);
    expect(cookieNames).toEqual(
      expect.arrayContaining(["cascade-active-organization", "cascade-active-environment"]),
    );
  } finally {
    await disposeDashboardActivationFixture(fixture);
  }
});
