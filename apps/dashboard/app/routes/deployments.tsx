import type { Route } from "./+types/deployments";
import { DeploymentsListView } from "~/features/deployments/deployments-list-view";
import type { DeploymentListItem } from "~/features/deployments/types";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

export function meta() {
  return [{ title: "Deployments | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    deployments: DeploymentListItem[];
  }>("/api/deployments");

  return {
    deployments: response.deployments,
  };
}

export default function Deployments({ loaderData }: Route.ComponentProps) {
  return <DeploymentsListView deployments={loaderData.deployments} />;
}
