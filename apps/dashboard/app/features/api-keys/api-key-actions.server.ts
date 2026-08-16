import type { ApiKey, ApiKeyActionData } from "./types";
import { cascadeApiRequest } from "~/lib/cascade-api.server";

type ActionFailure = Extract<ApiKeyActionData, { ok: false }>;

export async function handleApiKeyAction(formData: FormData) {
  const intent = formData.get("intent");

  if (intent === "rotate" || intent === "revoke") {
    return handleExistingApiKeyAction(intent, formData);
  }

  if (intent !== "create") {
    return jsonFailure(400, "INVALID_ACTION", "Unsupported API key action");
  }

  return handleCreateApiKey(formData);
}

async function handleExistingApiKeyAction(intent: "rotate" | "revoke", formData: FormData) {
  const apiKeyId = formData.get("apiKeyId");

  if (typeof apiKeyId !== "string") {
    return jsonFailure(400, "INVALID_FORM", "API key id is required");
  }

  try {
    const result = await cascadeApiRequest<{
      apiKey: ApiKey;
      token?: string;
    }>(`/api/api-keys/${encodeURIComponent(apiKeyId)}/${intent}`, {
      method: "POST",
    });

    return Response.json(
      intent === "rotate"
        ? { ok: true, intent, apiKey: result.apiKey, token: result.token ?? "" }
        : { ok: true, intent, apiKey: result.apiKey },
      intent === "rotate" ? noStoreHeaders() : undefined,
    );
  } catch (error) {
    return actionFailureResponse(error);
  }
}

async function handleCreateApiKey(formData: FormData) {
  const name = formData.get("name");
  const scopes = formData.getAll("scope");

  if (typeof name !== "string" || !scopes.every((scope) => typeof scope === "string")) {
    return jsonFailure(400, "INVALID_FORM", "API key name and permissions are required");
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
      body: JSON.stringify({ name, scopes }),
    });

    return Response.json(
      {
        ok: true,
        intent: "create",
        apiKey: result.apiKey,
        token: result.token,
      },
      noStoreHeaders(),
    );
  } catch (error) {
    return actionFailureResponse(error);
  }
}

function actionFailureResponse(error: unknown) {
  const failure = getActionFailure(error);
  return Response.json(failure.body, { status: failure.status });
}

function jsonFailure(status: number, code: string, message: string) {
  return Response.json(
    {
      ok: false,
      error: { code, message },
    } satisfies ActionFailure,
    { status },
  );
}

function getActionFailure(error: unknown) {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;

  const apiError = getApiError(error);
  return {
    status,
    body: {
      ok: false,
      error: {
        code: typeof apiError?.code === "string" ? apiError.code : "API_KEY_ACTION_FAILED",
        message:
          typeof apiError?.message === "string" ? apiError.message : "Could not update API key",
      },
    } satisfies ActionFailure,
  };
}

function getApiError(error: unknown) {
  const responseBody =
    typeof error === "object" && error !== null && "responseBody" in error
      ? error.responseBody
      : null;

  return typeof responseBody === "object" &&
    responseBody !== null &&
    "error" in responseBody &&
    typeof responseBody.error === "object" &&
    responseBody.error !== null
    ? (responseBody.error as { code?: unknown; message?: unknown })
    : null;
}

function noStoreHeaders() {
  return {
    headers: {
      "Cache-Control": "no-store",
    },
  };
}
