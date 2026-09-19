import { prisma } from "@cascade/database";
import { getDashboardSession } from "../auth/dashboard-session.server";
import { getSafeDashboardReturnTo } from "../auth/return-to.server";
import { getDashboardWorkspaceContext } from "../workspace/dashboard-workspace.server";
import { redirect } from "react-router";

type PersistedOnboardingStep = "authentication" | "workspace" | "activation";

function getPersistedOnboardingStep(
  value: FormDataEntryValue | null,
): PersistedOnboardingStep | null {
  if (value === "authentication" || value === "workspace" || value === "activation") {
    return value;
  }

  return null;
}

export async function getDashboardOnboardingPresentation(userId: string, environmentId: string) {
  const onboarding = await prisma.dashboardOnboarding.findUnique({
    where: {
      userId_environmentId: {
        userId,
        environmentId,
      },
    },
    select: {
      dismissedAt: true,
      displayedStep: true,
    },
  });

  return {
    dismissedAt: onboarding?.dismissedAt ?? null,
    displayedStep: getPersistedOnboardingStep(onboarding?.displayedStep ?? null) ?? "activation",
  };
}

export async function updateDisplayedOnboardingStep(request: Request, formData: FormData) {
  const displayedStep = getPersistedOnboardingStep(formData.get("displayedStep"));

  if (!displayedStep) {
    return Response.json(
      {
        error: "invalid_displayed_step",
        ok: false,
      },
      { status: 400 },
    );
  }

  const target = await getOnboardingTarget(request);

  if (target instanceof Response) {
    return target;
  }

  await prisma.dashboardOnboarding.upsert({
    where: {
      userId_environmentId: target,
    },
    update: {
      displayedStep,
    },
    create: {
      ...target,
      selectedSetupPath: "sdk",
      displayedStep,
    },
  });

  return Response.json({
    displayedStep,
    ok: true,
  });
}

export async function dismissDashboardOnboarding(request: Request, formData: FormData) {
  const target = await getOnboardingTarget(request);

  if (target instanceof Response) {
    return target;
  }

  const dismissedAt = new Date();

  await prisma.dashboardOnboarding.upsert({
    where: {
      userId_environmentId: target,
    },
    update: {
      dismissedAt,
    },
    create: {
      ...target,
      selectedSetupPath: "sdk",
      displayedStep: "activation",
      dismissedAt,
    },
  });

  return Response.json({
    ok: true,
    redirectTo: getSafeDashboardReturnTo(formData.get("returnTo")),
  });
}

export async function restartDashboardOnboarding(request: Request) {
  const target = await getOnboardingTarget(request);

  if (target instanceof Response) {
    return target;
  }

  const restartedAt = new Date();

  await prisma.dashboardOnboarding.upsert({
    where: {
      userId_environmentId: target,
    },
    update: {
      startedAt: restartedAt,
      restartedAt,
      dismissedAt: null,
      displayedStep: "activation",
    },
    create: {
      ...target,
      startedAt: restartedAt,
      restartedAt,
      selectedSetupPath: "sdk",
      displayedStep: "activation",
    },
  });

  return redirect("/login");
}

async function getOnboardingTarget(request: Request) {
  const session = await getDashboardSession(request);

  if (!session) {
    return Response.json(
      {
        error: "authentication_required",
        ok: false,
      },
      { status: 401 },
    );
  }

  const workspace = await getDashboardWorkspaceContext(request, session.userId);
  const environment = workspace.activeEnvironment;

  if (!environment) {
    return Response.json(
      {
        error: "workspace_required",
        ok: false,
      },
      { status: 409 },
    );
  }

  return {
    userId: session.userId,
    environmentId: environment.id,
  };
}
