import type { Route } from "./+types/api-keys";
import { Link } from "react-router";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  rotatedFromId: string | null;
};

type ApiKeyScopeDefinition = {
  value: string;
  label: string;
  description: string;
};

export function meta() {
  return [{ title: "API keys | Cascade" }];
}

export async function loader() {
  const response = await cascadeApiRequest<{
    apiKeys: ApiKey[];
    availableScopes: ApiKeyScopeDefinition[];
  }>("/api/api-keys");

  return {
    apiKeys: response.apiKeys,
    availableScopes: response.availableScopes,
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ApiKeys({ loaderData }: Route.ComponentProps) {
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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Prefix</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Permissions</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Last used</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loaderData.apiKeys.map((apiKey) => (
              <tr key={apiKey.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{apiKey.name}</td>

                <td className="px-4 py-3 font-mono text-xs text-gray-700">{apiKey.keyPrefix}…</td>

                <td className="px-4 py-3 text-gray-700">{apiKey.scopes.join(", ")}</td>

                <td className="px-4 py-3 text-gray-700">{formatDate(apiKey.lastUsedAt)}</td>

                <td className="px-4 py-3">
                  {apiKey.revokedAt ? (
                    <span className="text-red-700">Revoked</span>
                  ) : (
                    <span className="text-green-700">Active</span>
                  )}
                </td>

                <td className="px-4 py-3 text-gray-700">{formatDate(apiKey.createdAt)}</td>
              </tr>
            ))}

            {loaderData.apiKeys.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No API keys exist in this environment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
