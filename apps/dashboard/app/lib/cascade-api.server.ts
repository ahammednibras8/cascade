import { createDashboardApiAuthorizationForRequest } from "./dashboard-api-authorization.server";

const DASHBOARD_API_AUTH_HEADER = "x-cascade-dashboard-authorization";

class CascadeApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown,
    message: string,
  ) {
    super(message);
    this.name = "CascadeApiError";
  }
}

type CascadeErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

async function readResponseBody(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(status: number, body: unknown) {
  const errorBody = body as CascadeErrorBody;
  const apiMessage = errorBody.error?.message;
  const apiCode = errorBody.error?.code;

  if (typeof apiMessage === "string" && typeof apiCode === "string") {
    return `Cascade API request failed (${status} ${apiCode}): ${apiMessage}`;
  }

  if (typeof apiMessage === "string") {
    return `Cascade API request failed (${status}): ${apiMessage}`;
  }

  return `Cascade API request failed (${status})`;
}

function getApiUrl(): string {
  const apiUrl = process.env.CASCADE_API_URL;

  if (!apiUrl) {
    throw new Error("CASCADE_API_URL is required");
  }

  if (apiUrl.endsWith("/")) {
    return apiUrl.slice(0, -1);
  }

  return apiUrl;
}

function getApiKey() {
  const apiKey = process.env.CASCADE_DASHBOARD_API_KEY;

  if (!apiKey) {
    throw new Error("CASCADE_DASHBOARD_API_KEY is required");
  }

  return apiKey;
}

export async function cascadeApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...init.headers,
    },
  });

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new CascadeApiError(response.status, body, getErrorMessage(response.status, body));
  }

  return body as T;
}

export async function cascadeDashboardApiRequest<T>(
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const authorization = await createDashboardApiAuthorizationForRequest(request);

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      [DASHBOARD_API_AUTH_HEADER]: authorization,
    },
  });

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new CascadeApiError(response.status, body, getErrorMessage(response.status, body));
  }

  return body as T;
}

export async function cascadeApiStreamRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...init.headers,
    },
  });
}
