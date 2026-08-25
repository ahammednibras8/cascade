import {
  ListDeploymentsResponseSchema,
  type ListDeploymentsResponse,
} from "@cascade/api-contracts";
import type { Route } from "./+types/deployments";
import { DeploymentsListView } from "~/features/deployments/deployments-list-view";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";

export function meta() {
  return [{ title: "Deployments | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const url = new URL(request.url);

  const response = await cascadeDashboardApiRequest<ListDeploymentsResponse>(
    request,
    `/api/deployments${url.search}`,
    {
      responseSchema: ListDeploymentsResponseSchema,
    },
  );

  return {
    deployments: response.deployments,
    pagination: response.pagination,
    search: url.search,
  };
}

export default function Deployments({ loaderData }: Route.ComponentProps) {
  return (
    <DeploymentsListView
      deployments={loaderData.deployments}
      pagination={loaderData.pagination}
      search={loaderData.search}
    />
  );
}
