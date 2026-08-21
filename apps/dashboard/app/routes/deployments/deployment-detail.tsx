import {
  DeactivateDeploymentResponseSchema,
  DeploymentDetailResponseSchema,
  RollbackDeploymentResponseSchema,
} from "@cascade/api-contracts";
import type { Route } from "./+types/deployment-detail";
import {
  DeploymentDetailView,
  DeploymentNotFound,
} from "~/features/deployments/deployment-detail-view";
import { isDeploymentNotFoundError } from "~/features/deployments/errors";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";
import { requireDashboardCapability } from "~/lib/auth/dashboard-permissions.server";
import { getDashboardWorkspaceContext } from "~/lib/workspace/dashboard-workspace.server";

type DeploymentActionIntent = "deactivate" | "rollback";

export function meta() {
  return [{ title: "Deployment detail | Cascade" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const session = await requireDashboardUser(request);
  const workspace = await getDashboardWorkspaceContext(request, session.userId);
  const role = workspace.activeOrganization?.role ?? null;

  const deploymentId = params.deploymentId;

  try {
    const response = await cascadeDashboardApiRequest(
      request,
      `/api/deployments/${encodeURIComponent(deploymentId)}`,
      {
        responseSchema: DeploymentDetailResponseSchema,
      },
    );

    return {
      deployment: response.deployment,
      deploymentId,
      role,
    };
  } catch (error) {
    if (isDeploymentNotFoundError(error)) {
      return {
        deployment: null,
        deploymentId,
        role,
      };
    }

    throw error;
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  await requireDashboardCapability(request, "DEPLOYMENTS_MANAGE");

  const intent = getDeploymentActionIntent(await request.formData());
  const deploymentId = encodeURIComponent(params.deploymentId);

  try {
    return await callDeploymentAction(request, deploymentId, intent);
  } catch (error) {
    throw new Response(getActionFailureMessage(intent), {
      status: getActionFailureStatus(error),
    });
  }
}

async function callDeploymentAction(
  request: Request,
  deploymentId: string,
  intent: DeploymentActionIntent,
) {
  const path = `/api/deployments/${deploymentId}/${intent}`;

  if (intent === "deactivate") {
    const response = await cascadeDashboardApiRequest(request, path, {
      method: "POST",
      responseSchema: DeactivateDeploymentResponseSchema,
    });

    return {
      ok: true as const,
      intent,
      deployment: response.deployment,
    };
  }

  const response = await cascadeDashboardApiRequest(request, path, {
    method: "POST",
    responseSchema: RollbackDeploymentResponseSchema,
  });

  return {
    ok: true as const,
    intent,
    deployment: response.deployment,
  };
}

function getDeploymentActionIntent(formData: FormData): DeploymentActionIntent {
  const intent = formData.get("intent");

  if (intent !== "deactivate" && intent !== "rollback") {
    throw new Response("Invalid deployment action", {
      status: 400,
    });
  }

  return intent;
}

function getActionFailureMessage(intent: DeploymentActionIntent) {
  return intent === "rollback"
    ? "Could not roll back deployment"
    : "Could not deactivate deployment";
}

function getActionFailureStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 500;
}

export default function DeploymentDetail({ loaderData }: Route.ComponentProps) {
  return loaderData.deployment ? (
    <DeploymentDetailView deployment={loaderData.deployment} role={loaderData.role} />
  ) : (
    <DeploymentNotFound deploymentId={loaderData.deploymentId} />
  );
}
