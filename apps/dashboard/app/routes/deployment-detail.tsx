import type { Route } from "./+types/deployment-detail";
import {
  DeploymentDetailView,
  DeploymentNotFound,
} from "~/features/deployments/deployment-detail-view";
import { isDeploymentNotFoundError } from "~/features/deployments/errors";
import type { Deployment } from "~/features/deployments/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";
import { requireDashboardCapability } from "~/lib/dashboard-permissions.server";

type DeploymentActionIntent = "deactivate" | "rollback";

export function meta() {
  return [{ title: "Deployment detail | Cascade" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const deploymentId = params.deploymentId;

  try {
    const response = await cascadeDashboardApiRequest<{
      deployment: Deployment;
    }>(request, `/api/deployments/${encodeURIComponent(deploymentId)}`);

    return {
      deployment: response.deployment,
      deploymentId,
    };
  } catch (error) {
    if (isDeploymentNotFoundError(error)) {
      return {
        deployment: null,
        deploymentId,
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
    const response = await cascadeDashboardApiRequest<{
      deployment: {
        id: string;
        status: "ACTIVE" | "INACTIVE";
      };
    }>(request, `/api/deployments/${deploymentId}/${intent}`, {
      method: "POST",
    });

    return {
      ok: true,
      intent,
      deployment: response.deployment,
    };
  } catch (error) {
    throw new Response(getActionFailureMessage(intent), {
      status: getActionFailureStatus(error),
    });
  }
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
    <DeploymentDetailView deployment={loaderData.deployment} />
  ) : (
    <DeploymentNotFound deploymentId={loaderData.deploymentId} />
  );
}
