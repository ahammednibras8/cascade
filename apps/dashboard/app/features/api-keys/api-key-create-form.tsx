import type { FetcherWithComponents } from "react-router";
import type { ApiKeyActionData, ApiKeyScopeDefinition } from "./types";

type ApiKeyCreateFormProps = {
  availableScopes: ApiKeyScopeDefinition[];
  fetcher: FetcherWithComponents<ApiKeyActionData>;
};

export function ApiKeyCreateForm({ availableScopes, fetcher }: ApiKeyCreateFormProps) {
  const isCreating = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "create";
  const actionError = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-950">Create API key</h2>
      <p className="mt-1 text-sm text-gray-600">
        Give the key only the permissions its workload needs.
      </p>

      <fetcher.Form method="post" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value="create" />
        <label className="block">
          <span className="text-sm font-medium text-gray-800">Name</span>
          <input
            name="name"
            required
            maxLength={120}
            placeholder="GitHub deployment workflow"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-gray-800">Permissions</legend>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {availableScopes.map((scope) => (
              <label key={scope.value} className="flex gap-3 rounded-md border border-gray-200 p-3">
                <input type="checkbox" name="scope" value={scope.value} className="mt-1" />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{scope.label}</span>
                  <span className="mt-1 block text-xs text-gray-600">{scope.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {actionError ? (
          <p role="alert" className="text-sm text-red-700">
            {actionError.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isCreating}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? "Creating API key…" : "Create API key"}
        </button>
      </fetcher.Form>
    </section>
  );
}
