import type { Route } from "./+types/api-keys";
import { handleApiKeyAction } from "~/features/api-keys/api-key-actions.server";
import { ApiKeysPage } from "~/features/api-keys/api-keys-page";
import { ListApiKeysResponseSchema, type ListApiKeysResponse } from "@cascade/api-contracts";
import { cascadeDashboardApiRequest } from "~/lib/api/cascade-api.server";
import { requireDashboardCapability } from "~/lib/auth/dashboard-permissions.server";

export function meta() {
  return [{ title: "API keys | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardCapability(request, "API_KEYS_MANAGE");

  const url = new URL(request.url);

  const response = await cascadeDashboardApiRequest<ListApiKeysResponse>(
    request,
    `/api/api-keys${url.search}`,
    {
      responseSchema: ListApiKeysResponseSchema,
    },
  );

  return {
    apiKeys: response.apiKeys,
    availableScopes: response.availableScopes,
    pagination: response.pagination,
    search: url.search,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireDashboardCapability(request, "API_KEYS_MANAGE");
  return handleApiKeyAction(request, await request.formData());
}

export default function ApiKeys({ loaderData }: Route.ComponentProps) {
  return (
    <ApiKeysPage
      apiKeys={loaderData.apiKeys}
      availableScopes={loaderData.availableScopes}
      pagination={loaderData.pagination}
      search={loaderData.search}
    />
  );
}
