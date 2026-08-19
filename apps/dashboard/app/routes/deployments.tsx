import type { Route } from "./+types/deployments";
import { DeploymentsListView } from "~/features/deployments/deployments-list-view";
import type { DeploymentListItem } from "~/features/deployments/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

export function meta() {
  return [{ title: "Deployments | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeDashboardApiRequest<{
    deployments: DeploymentListItem[];
  }>(request, "/api/deployments");

  return {
    deployments: response.deployments,
  };
}

export default function Deployments({ loaderData }: Route.ComponentProps) {
  return <DeploymentsListView deployments={loaderData.deployments} />;
}
