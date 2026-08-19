import type { Route } from "./+types/api-keys";
import { handleApiKeyAction } from "~/features/api-keys/api-key-actions.server";
import { ApiKeysPage } from "~/features/api-keys/api-keys-page";
import type { ApiKey, ApiKeyScopeDefinition } from "~/features/api-keys/types";
import { cascadeDashboardApiRequest } from "~/lib/cascade-api.server";
import { requireDashboardUser } from "~/lib/dashboard-auth.server";

export function meta() {
  return [{ title: "API keys | Cascade" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  const response = await cascadeDashboardApiRequest<{
    apiKeys: ApiKey[];
    availableScopes: ApiKeyScopeDefinition[];
  }>(request, "/api/api-keys");

  return {
    apiKeys: response.apiKeys,
    availableScopes: response.availableScopes,
  };
}

export async function action({ request }: Route.ActionArgs) {
  return handleApiKeyAction(request, await request.formData());
}

export default function ApiKeys({ loaderData }: Route.ComponentProps) {
  return <ApiKeysPage apiKeys={loaderData.apiKeys} availableScopes={loaderData.availableScopes} />;
}
