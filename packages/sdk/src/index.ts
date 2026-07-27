import {
  createRootTraceContext,
  task,
  type JsonValue,
  type TaskDefinition,
  type TaskDefinitionInput,
} from "@cascade/core";

export { createPackageInfo, packageName } from "@cascade/core";

export function defineTask<
  TPayload extends JsonValue = JsonValue,
  TOutput extends JsonValue | void = JsonValue | void,
>(definition: TaskDefinitionInput<TPayload, TOutput>) {
  return task(definition);
}

export type CascadeClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export type TriggerTaskOptions<TPayload extends JsonValue = JsonValue> = {
  payload?: TPayload;
  idempotencyKey?: string;
  delayUntil?: Date | string;
  traceparent?: string;
};

export type TriggerTaskRunResponse<TPayload extends JsonValue = JsonValue> = {
  id: string;
  taskId: string;
  taskSlug: string;
  taskName: string;
  status: string;
  payload: TPayload | null;
  createdAt: string;
  idempotentReplay: boolean;
  traceparent: string;
};

export class CascadeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly responseBody: unknown;

  constructor(input: { status: number; code: string; message: string; responseBody: unknown }) {
    super(input.message);

    this.name = "CascadeApiError";
    this.status = input.status;
    this.code = input.code;
    this.responseBody = input.responseBody;
  }
}

type TriggerTaskSuccessResponse<TPayload extends JsonValue> = {
  taskRun: TriggerTaskRunResponse<TPayload>;
};

type CascadeErrorResponse = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

export function trimTrailingSlash(value: string): string {
  let endIndex = value.length;

  while (endIndex > 0 && value[endIndex - 1] === "/") {
    endIndex--;
  }

  return value.slice(0, endIndex);
}

function getFetch(fetchImplementation: typeof fetch | undefined) {
  if (fetchImplementation) {
    return fetchImplementation;
  }

  if (typeof fetch === "undefined") {
    throw new Error(
      "fetch is not available. Pass a fetch implementation to createCascadeClient().",
    );
  }

  return fetch;
}

function normalizeDelayUntil(delayUntil: Date | string | undefined) {
  if (delayUntil === undefined) {
    return undefined;
  }

  if (delayUntil instanceof Date) {
    return delayUntil.toISOString();
  }

  return delayUntil;
}

function buildTriggerBody<TPayload extends JsonValue>(options: TriggerTaskOptions<TPayload>) {
  const body: {
    payload?: TPayload;
    delayUntil?: string;
  } = {};

  if (options.payload !== undefined) {
    body.payload = options.payload;
  }

  const delayUntil = normalizeDelayUntil(options.delayUntil);

  if (delayUntil !== undefined) {
    body.delayUntil = delayUntil;
  }

  return body;
}

async function parseResponseBody(response: Response) {
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

function getErrorMessage(body: unknown) {
  const candidate = body as CascadeErrorResponse;

  if (typeof candidate?.error?.message === "string") {
    return candidate.error.message;
  }

  return "Cascade API request failed";
}

function getErrorCode(body: unknown) {
  const candidate = body as CascadeErrorResponse;

  if (typeof candidate?.error?.code === "string") {
    return candidate.error.code;
  }

  return "CASCADE_API_ERROR";
}

export function createCascadeClient(options: CascadeClientOptions) {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const fetchImplementation = getFetch(options.fetch);

  async function request<TResponse>(path: string, init: RequestInit) {
    const response = await fetchImplementation(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        ...init.headers,
      },
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
      throw new CascadeApiError({
        status: response.status,
        code: getErrorCode(body),
        message: getErrorMessage(body),
        responseBody: body,
      });
    }

    return body as TResponse;
  }

  return {
    async triggerTask<TPayload extends JsonValue, TOutput extends JsonValue | void>(
      taskDefinition: TaskDefinition<TPayload, TOutput>,
      triggerOptions: TriggerTaskOptions<TPayload> = {},
    ) {
      const traceparent = triggerOptions.traceparent ?? createRootTraceContext().traceparent;

      const response = await request<TriggerTaskSuccessResponse<TPayload>>(
        `/api/tasks/slug/${encodeURIComponent(taskDefinition.id)}/trigger`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            traceparent,
            ...(triggerOptions.idempotencyKey
              ? { "Idempotency-Key": triggerOptions.idempotencyKey }
              : {}),
          },
          body: JSON.stringify(buildTriggerBody(triggerOptions)),
        },
      );

      return response.taskRun;
    },
  };
}
