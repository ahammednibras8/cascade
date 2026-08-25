import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { ApiKeyCreateForm } from "./api-key-create-form";
import { ApiKeySecretPanel } from "./api-key-secret-panel";
import { ApiKeyTable } from "./api-key-table";
import type { ApiKey, ApiKeyActionData, ApiKeyScopeDefinition, RevealedApiKey } from "./types";
import type { ListApiKeysResponse } from "@cascade/api-contracts";
import { CursorPagination } from "~/components/cursor-pagination";
import { createListPath } from "~/lib/pagination/cursor-pagination";

type ApiKeysPageProps = {
  apiKeys: ApiKey[];
  availableScopes: ApiKeyScopeDefinition[];
  pagination: ListApiKeysResponse["pagination"];
  search: string;
};

export function ApiKeysPage({ apiKeys, availableScopes, pagination, search }: ApiKeysPageProps) {
  const fetcher = useFetcher<ApiKeyActionData>();
  const [revealedApiKey, setRevealedApiKey] = useState<RevealedApiKey | null>(null);
  const processedActionData = useRef<ApiKeyActionData | undefined>(undefined);

  useEffect(() => {
    const actionData = fetcher.data;

    if (!actionData || actionData === processedActionData.current) {
      return;
    }

    processedActionData.current = actionData;

    if (actionData.ok && (actionData.intent === "create" || actionData.intent === "rotate")) {
      setRevealedApiKey({
        name: actionData.apiKey.name,
        token: actionData.token,
      });
    }
  }, [fetcher.data]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <Link to="/dashboard" className="text-sm text-blue-700 hover:underline">
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-2 text-gray-600">
          API keys are scoped to the current environment. Secrets are never shown again after
          creation or rotation.
        </p>
        <ApiKeyStateFilters search={search} />
      </div>

      {revealedApiKey ? (
        <ApiKeySecretPanel apiKey={revealedApiKey} onDismiss={() => setRevealedApiKey(null)} />
      ) : null}

      <ApiKeyCreateForm availableScopes={availableScopes} fetcher={fetcher} />
      <ApiKeyTable apiKeys={apiKeys} fetcher={fetcher} />
      <CursorPagination
        ariaLabel="API key pagination"
        pathname="/api-keys"
        search={search}
        itemCount={apiKeys.length}
        itemLabel="API key"
        pagination={pagination}
      />
    </main>
  );
}

function ApiKeyStateFilters({ search }: { search: string }) {
  const revoked = new URLSearchParams(search).get("revoked");

  return (
    <nav aria-label="API key state filters" className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium text-gray-700">State:</span>

      <Link
        to={createApiKeyStatePath(search, null)}
        className={apiKeyStateFilterClass(revoked === null)}
      >
        All keys
      </Link>

      <Link
        to={createApiKeyStatePath(search, "false")}
        className={apiKeyStateFilterClass(revoked === "false")}
      >
        Active
      </Link>

      <Link
        to={createApiKeyStatePath(search, "true")}
        className={apiKeyStateFilterClass(revoked === "true")}
      >
        Revoked
      </Link>
    </nav>
  );
}

function createApiKeyStatePath(search: string, revoked: "true" | "false" | null) {
  const parameters = new URLSearchParams(search);

  parameters.delete("cursor");

  if (revoked) {
    parameters.set("revoked", revoked);
  } else {
    parameters.delete("revoked");
  }

  return createListPath("/api-keys", parameters);
}

function apiKeyStateFilterClass(isActive: boolean) {
  return isActive
    ? "rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
    : "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900";
}
