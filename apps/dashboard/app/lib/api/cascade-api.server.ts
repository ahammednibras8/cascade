import {
  ApiErrorResponseSchema,
  parseApiResponse,
  type ApiResponseSchema,
} from "@cascade/api-contracts";
import { createDashboardApiAuthorizationForRequest } from "../auth/dashboard-api-authorization.server";

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

type CascadeDashboardApiRequestInit<TResponse> = RequestInit & {
  responseSchema?: ApiResponseSchema<TResponse>;
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
  const parsedBody = ApiErrorResponseSchema.safeParse(body);

  if (parsedBody.success) {
    return `Cascade API request failed (${status} ${parsedBody.data.error.code}): ${parsedBody.data.error.message}`;
  }

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
  const apiUrl = process.env["CASCADE_API_URL"];

  if (!apiUrl) {
    throw new Error("CASCADE_API_URL is required");
  }

  if (apiUrl.endsWith("/")) {
    return apiUrl.slice(0, -1);
  }

  return apiUrl;
}

export async function cascadeDashboardApiRequest<T>(
  request: Request,
  path: string,
  init: CascadeDashboardApiRequestInit<T> = {},
): Promise<T> {
  const authorization = await createDashboardApiAuthorizationForRequest(request);
  const { responseSchema, ...fetchInit } = init;

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...fetchInit,
    headers: {
      ...fetchInit.headers,
      [DASHBOARD_API_AUTH_HEADER]: authorization,
    },
  });

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new CascadeApiError(response.status, body, getErrorMessage(response.status, body));
  }

  return responseSchema ? parseApiResponse(responseSchema, body) : (body as T);
}

export async function cascadeDashboardApiStreamRequest(
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const authorization = await createDashboardApiAuthorizationForRequest(request);

  return fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      [DASHBOARD_API_AUTH_HEADER]: authorization,
    },
  });
}
