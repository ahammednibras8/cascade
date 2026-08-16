import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { ApiKeyCreateForm } from "./api-key-create-form";
import { ApiKeySecretPanel } from "./api-key-secret-panel";
import { ApiKeyTable } from "./api-key-table";
import type { ApiKey, ApiKeyActionData, ApiKeyScopeDefinition, RevealedApiKey } from "./types";

type ApiKeysPageProps = {
  apiKeys: ApiKey[];
  availableScopes: ApiKeyScopeDefinition[];
};

export function ApiKeysPage({ apiKeys, availableScopes }: ApiKeysPageProps) {
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
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-2 text-gray-600">
          API keys are scoped to the current environment. Secrets are never shown again after
          creation or rotation.
        </p>
      </div>

      {revealedApiKey ? (
        <ApiKeySecretPanel apiKey={revealedApiKey} onDismiss={() => setRevealedApiKey(null)} />
      ) : null}

      <ApiKeyCreateForm availableScopes={availableScopes} fetcher={fetcher} />
      <ApiKeyTable apiKeys={apiKeys} fetcher={fetcher} />
    </main>
  );
}
