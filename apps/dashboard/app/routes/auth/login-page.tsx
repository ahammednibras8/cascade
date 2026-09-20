import AuthEntryPage from "~/components/auth/AuthEntryPage";
import {
  commitDashboardSession,
  getDashboardSession,
  rotateDashboardSession,
} from "~/lib/auth/dashboard-session.server";
import {
  findOrCreateDevDashboardUser,
  getDashboardUserIdentitySummary,
} from "~/lib/auth/dashboard-user.server";
import {
  resolveDashboardActivationState,
  resolveWorkspaceActivationState,
} from "~/lib/activation/activation-state.server";
import type { Route } from "./+types/login-page";
import { redirect, type ShouldRevalidateFunctionArgs } from "react-router";
import { createPersonalWorkspace } from "~/lib/auth/create-personal-workspace.server";
import { commitActiveDashboardOrganization } from "~/lib/workspace/dashboard-organization.server";
import { commitActiveDashboardEnvironment } from "~/lib/workspace/dashboard-workspace.server";
import { isDevDashboardAuthEnabled } from "~/lib/auth/dashboard-auth-mode.server";
import { getSafeDashboardReturnTo } from "~/lib/auth/return-to.server";
import { getDashboardLoginErrorMessage } from "~/lib/auth/login-error";
import { handleApiKeyAction } from "~/features/api-keys/api-key-actions.server";
import { requireDashboardCapability } from "~/lib/auth/dashboard-permissions.server";
import {
  dismissDashboardOnboarding,
  getDashboardOnboardingPresentation,
  updateDisplayedOnboardingStep,
  restartDashboardOnboarding,
} from "~/lib/activation/onboarding-metadata.server";
import type { ApiKeyActionData } from "~/features/api-keys/types";
import { getCascadePublicApiUrl } from "~/lib/api/cascade-api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = getSafeDashboardReturnTo(url.searchParams.get("returnTo"));
  const session = await getDashboardSession(request);

  const [activationState, identity] = await Promise.all([
    resolveDashboardActivationState(request, session),
    session ? getDashboardUserIdentitySummary(session.userId) : Promise.resolve(null),
  ]);

  if (activationState.state === "ACTIVATED") {
    throw redirect(returnTo);
  }

  if (activationState.state === "AUTH_REQUIRED") {
    return {
      activationState: null,
      authenticated: false,
      devAuthEnabled: isDevDashboardAuthEnabled(),
      error: getDashboardLoginErrorMessage(url.searchParams.get("error")),
      returnTo,
      stage: "authentication" as const,
      identity,
      progressStage: "authentication" as const,
    };
  }

  if (activationState.state === "WORKSPACE_REQUIRED") {
    return {
      activationState: null,
      authenticated: true,
      devAuthEnabled: isDevDashboardAuthEnabled(),
      error: null,
      returnTo,
      stage: "workspace" as const,
      identity,
      progressStage: "workspace" as const,
    };
  }

  if (!session) {
    throw new Error("Pending activation state requires a dashboard session");
  }

  const onboardingPresentation = await getDashboardOnboardingPresentation(
    session.userId,
    activationState.environmentId,
  );

  if (onboardingPresentation.dismissedAt) {
    throw redirect(returnTo);
  }

  return {
    activationState,
    authenticated: true,
    devAuthEnabled: isDevDashboardAuthEnabled(),
    error: null,
    returnTo,
    stage: onboardingPresentation.displayedStep,
    identity,
    progressStage: "activation" as const,
  };
}

export function shouldRevalidate({
  defaultShouldRevalidate,
  formData,
}: ShouldRevalidateFunctionArgs) {
  if (formData?.get("intent") === "refresh_activation") {
    return false;
  }

  return defaultShouldRevalidate;
}

async function refreshDashboardActivation(request: Request) {
  const activationState = await resolveDashboardActivationState(request);

  if (activationState.state === "AUTH_REQUIRED") {
    return Response.json(
      {
        error: "authentication_required",
        ok: false,
      },
      { status: 401 },
    );
  }

  if (activationState.state === "WORKSPACE_REQUIRED") {
    return Response.json(
      {
        error: "workspace_required",
        ok: false,
      },
      { status: 409 },
    );
  }

  if (activationState.state === "ACTIVATED") {
    return redirect(`/runs/${encodeURIComponent(activationState.runId)}`);
  }

  return Response.json({
    activationState,
    ok: true,
    stage: "activation" as const,
  });
}

async function createActivationApiKey(request: Request, formData: FormData) {
  await requireDashboardCapability(request, "API_KEYS_MANAGE");

  const apiKeyFormData = new FormData();
  const name = formData.get("name");

  apiKeyFormData.set("intent", "create");

  if (typeof name === "string") {
    apiKeyFormData.set("name", name);
  }

  apiKeyFormData.append("scope", "DEPLOYMENTS_WRITE");
  apiKeyFormData.append("scope", "TASKS_TRIGGER");
  apiKeyFormData.append("scope", "RUNS_READ");

  const response = await handleApiKeyAction(request, apiKeyFormData);

  if (!response.ok) {
    return response;
  }

  const result = (await response.json()) as ApiKeyActionData;

  if (!result.ok || result.intent !== "create") {
    throw new Error("Expected an API key creation response");
  }

  return Response.json(
    {
      ...result,
      apiUrl: getCascadePublicApiUrl(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

async function createDashboardWorkspace(request: Request, formData: FormData) {
  const session = await getDashboardSession(request);
  const projectName = formData.get("projectName");

  if (!session) {
    throw redirect("/login");
  }

  if (typeof projectName !== "string" || !projectName.trim()) {
    return Response.json({ ok: false, error: "project_name_required" }, { status: 400 });
  }

  const workspace = await createPersonalWorkspace({
    userId: session.userId,
    projectName,
  });

  const activationState = await resolveWorkspaceActivationState(
    workspace.environmentId,
    session.userId,
  );

  if (activationState.state === "WORKSPACE_REQUIRED" || activationState.state === "ACTIVATED") {
    throw new Error("Expected a pending activation state after workspace creation");
  }

  const headers = new Headers();
  headers.append("Set-Cookie", await commitActiveDashboardOrganization(workspace.organizationId));
  headers.append("Set-Cookie", await commitActiveDashboardEnvironment(workspace.environmentId));

  return Response.json(
    {
      activationState,
      ok: true,
      stage: "activation" as const,
    },
    {
      headers,
    },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update_displayed_step") {
    return updateDisplayedOnboardingStep(request, formData);
  }

  if (intent === "dismiss_onboarding") {
    return dismissDashboardOnboarding(request, formData);
  }

  if (intent === "restart_onboarding") {
    return restartDashboardOnboarding(request);
  }

  if (intent === "refresh_activation") {
    return refreshDashboardActivation(request);
  }

  if (intent === "create_activation_key") {
    return createActivationApiKey(request, formData);
  }

  if (intent === "create_workspace") {
    return createDashboardWorkspace(request, formData);
  }

  if (intent !== "authenticate" || !isDevDashboardAuthEnabled()) {
    return Response.json({ ok: false, error: "authentication_unavailable" }, { status: 400 });
  }

  const existingSession = await getDashboardSession(request);

  if (existingSession) {
    const identity = await getDashboardUserIdentitySummary(existingSession.userId);

    return {
      identity,
      ok: true,
      stage: "workspace" as const,
    };
  }

  const user = await findOrCreateDevDashboardUser();
  const session = await rotateDashboardSession(request, user.id);

  return Response.json(
    {
      identity: {
        displayName: user.displayName,
        email: user.email,
        provider: null,
      },
      ok: true,
      stage: "workspace" as const,
    },
    {
      headers: {
        "Set-Cookie": await commitDashboardSession(session),
      },
    },
  );
}

export function meta() {
  return [{ title: "Sign in · Cascade" }, { name: "description", content: "Sign in to Cascade." }];
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const startHref = `/auth/start?returnTo=${encodeURIComponent(loaderData.returnTo)}`;
  const selectAccountHref = `/auth/start?selectAccount=true&returnTo=${encodeURIComponent(
    loaderData.returnTo,
  )}`;

  return (
    <AuthEntryPage
      activationState={loaderData.activationState}
      authenticated={loaderData.authenticated}
      devAuthEnabled={loaderData.devAuthEnabled}
      error={loaderData.error}
      identity={loaderData.identity}
      returnTo={loaderData.returnTo}
      selectAccountHref={selectAccountHref}
      stage={loaderData.stage}
      startHref={startHref}
      progressStage={loaderData.progressStage}
    />
  );
}
