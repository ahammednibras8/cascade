import type { Route } from "./+types/api-keys";
import { Link, useFetcher } from "react-router";
import { useEffect, useRef, useState } from "react";
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

type ApiKeyActionData =
  | {
      ok: true;
      intent: "create";
      apiKey: ApiKey;
      token: string;
    }
  | {
      ok: true;
      intent: "revoke";
      apiKey: ApiKey;
    }
  | {
      ok: true;
      intent: "rotate";
      apiKey: ApiKey;
      token: string;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

type RevealedApiKey = {
  name: string;
  token: string;
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

function getActionFailure(error: unknown) {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;

  const responseBody =
    typeof error === "object" && error !== null && "responseBody" in error
      ? error.responseBody
      : null;

  const apiError =
    typeof responseBody === "object" &&
    responseBody !== null &&
    "error" in responseBody &&
    typeof responseBody.error === "object" &&
    responseBody.error !== null
      ? responseBody.error
      : null;

  const code =
    apiError && "code" in apiError && typeof apiError.code === "string"
      ? apiError.code
      : "API_KEY_ACTION_FAILED";

  const message =
    apiError && "message" in apiError && typeof apiError.message === "string"
      ? apiError.message
      : "Could not update API key";

  return {
    status,
    error: {
      code,
      message,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "rotate") {
    const apiKeyId = formData.get("apiKeyId");

    if (typeof apiKeyId !== "string") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_FORM",
            message: "API key id is required",
          },
        },
        {
          status: 400,
        },
      );
    }

    try {
      const result = await cascadeApiRequest<{
        apiKey: ApiKey;
        token: string;
      }>(`/api/api-keys/${encodeURIComponent(apiKeyId)}/rotate`, {
        method: "POST",
      });

      return Response.json(
        {
          ok: true,
          intent: "rotate",
          apiKey: result.apiKey,
          token: result.token,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    } catch (error) {
      const failure = getActionFailure(error);

      return Response.json(
        {
          ok: false,
          error: failure.error,
        },
        {
          status: failure.status,
        },
      );
    }
  }

  if (intent === "revoke") {
    const apiKeyId = formData.get("apiKeyId");

    if (typeof apiKeyId !== "string") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_FORM",
            message: "API key id is required",
          },
        },
        {
          status: 400,
        },
      );
    }

    try {
      const result = await cascadeApiRequest<{
        apiKey: ApiKey;
      }>(`/api/api-keys/${encodeURIComponent(apiKeyId)}/revoke`, {
        method: "POST",
      });

      return Response.json({
        ok: true,
        intent: "revoke",
        apiKey: result.apiKey,
      });
    } catch (error) {
      const failure = getActionFailure(error);

      return Response.json(
        {
          ok: false,
          error: failure.error,
        },
        {
          status: failure.status,
        },
      );
    }
  }

  if (intent !== "create") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_ACTION",
          message: "Unsupported API key action",
        },
      },
      {
        status: 400,
      },
    );
  }

  const name = formData.get("name");
  const scopes = formData.getAll("scope");

  if (typeof name !== "string" || !scopes.every((scope) => typeof scope === "string")) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_FORM",
          message: "API key name and permissions are required",
        },
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result = await cascadeApiRequest<{
      apiKey: ApiKey;
      token: string;
    }>("/api/api-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        scopes,
      }),
    });

    return Response.json(
      {
        ok: true,
        intent: "create",
        apiKey: result.apiKey,
        token: result.token,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const failure = getActionFailure(error);

    return Response.json(
      {
        ok: false,
        error: failure.error,
      },
      {
        status: failure.status,
      },
    );
  }
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

  const isSubmitting = fetcher.state !== "idle";
  const submittedIntent = fetcher.formData?.get("intent");
  const isCreating = isSubmitting && submittedIntent === "create";
  const actionError = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  async function copyRevealedToken() {
    if (!revealedApiKey) {
      return;
    }

    await navigator.clipboard.writeText(revealedApiKey.token);
  }

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
        <section
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4"
          aria-labelledby="new-api-key-heading"
        >
          <h2 id="new-api-key-heading" className="font-semibold text-amber-950">
            Copy this API key now
          </h2>

          <p className="mt-1 text-sm text-amber-900">
            This is the only time Cascade will show the secret for {revealedApiKey.name}.
          </p>

          <code className="mt-3 block break-all rounded bg-white p-3 font-mono text-sm text-gray-950">
            {revealedApiKey.token}
          </code>

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => void copyRevealedToken()}
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
            >
              Copy API key
            </button>

            <button
              type="button"
              onClick={() => setRevealedApiKey(null)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
            >
              I copied it
            </button>
          </div>
        </section>
      ) : null}

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
              {loaderData.availableScopes.map((scope) => (
                <label
                  key={scope.value}
                  className="flex gap-3 rounded-md border border-gray-200 p-3"
                >
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
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

                <td className="px-4 py-3">
                  {apiKey.revokedAt ? (
                    <span className="text-gray-500">—</span>
                  ) : (
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
                          if (
                            !window.confirm(
                              `Revoke API key "${apiKey.name}"? This cannot be undone.`,
                            )
                          ) {
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
                  )}
                </td>
              </tr>
            ))}

            {loaderData.apiKeys.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
