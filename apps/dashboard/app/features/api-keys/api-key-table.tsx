import type { FetcherWithComponents } from "react-router";
import type { ApiKey, ApiKeyActionData } from "./types";

type ApiKeyTableProps = {
  apiKeys: ApiKey[];
  fetcher: FetcherWithComponents<ApiKeyActionData>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ApiKeyTable({ apiKeys, fetcher }: ApiKeyTableProps) {
  const isSubmitting = fetcher.state !== "idle";
  const submittedIntent = fetcher.formData?.get("intent");

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Name", "Prefix", "Permissions", "Last used", "Status", "Created", "Actions"].map(
              (heading) => (
                <th key={heading} className="px-4 py-3 text-left font-medium text-gray-600">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {apiKeys.map((apiKey) => (
            <ApiKeyRow
              key={apiKey.id}
              apiKey={apiKey}
              fetcher={fetcher}
              isSubmitting={isSubmitting}
              submittedIntent={submittedIntent}
            />
          ))}
          {apiKeys.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                No API keys exist in this environment.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  fetcher,
  isSubmitting,
  submittedIntent,
}: {
  apiKey: ApiKey;
  fetcher: FetcherWithComponents<ApiKeyActionData>;
  isSubmitting: boolean;
  submittedIntent: FormDataEntryValue | null | undefined;
}) {
  return (
    <tr>
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
      <td className="px-4 py-3">
        {apiKey.revokedAt ? (
          <span className="text-gray-500">—</span>
        ) : (
          <ApiKeyRowActions
            apiKey={apiKey}
            fetcher={fetcher}
            isSubmitting={isSubmitting}
            submittedIntent={submittedIntent}
          />
        )}
      </td>
    </tr>
  );
}

function ApiKeyRowActions({
  apiKey,
  fetcher,
  isSubmitting,
  submittedIntent,
}: {
  apiKey: ApiKey;
  fetcher: FetcherWithComponents<ApiKeyActionData>;
  isSubmitting: boolean;
  submittedIntent: FormDataEntryValue | null | undefined;
}) {
  return (
    <div className="flex gap-2">
      <fetcher.Form
        method="post"
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Rotate API key "${apiKey.name}"? The old key will stop working immediately.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="rotate" />
        <input type="hidden" name="apiKeyId" value={apiKey.id} />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && submittedIntent === "rotate" ? "Rotating…" : "Rotate"}
        </button>
      </fetcher.Form>

      <fetcher.Form
        method="post"
        onSubmit={(event) => {
          if (!window.confirm(`Revoke API key "${apiKey.name}"? This cannot be undone.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="revoke" />
        <input type="hidden" name="apiKeyId" value={apiKey.id} />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && submittedIntent === "revoke" ? "Revoking…" : "Revoke"}
        </button>
      </fetcher.Form>
    </div>
  );
}
