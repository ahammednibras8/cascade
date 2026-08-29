import {
  createRootTraceContext,
  task,
  toTraceparent,
  type JsonValue,
  type TaskDefinition,
  type TaskDefinitionInput,
} from "@cascade/core";
import {
  ApiErrorResponseSchema,
  TriggerTaskRunResponseSchema,
  parseApiResponse,
  type ApiResponseSchema,
  type TriggerTaskRunResponse as TriggerTaskRunResponseBody,
  CreateDeploymentResponseSchema,
  type CreateDeploymentResponse,
} from "@cascade/api-contracts";
import {
  context,
  isSpanContextValid,
  trace,
  TraceFlags,
  type SpanContext,
} from "@opentelemetry/api";

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

export type TriggerTaskRunResponse<TPayload extends JsonValue = JsonValue> = Omit<
  TriggerTaskRunResponseBody["taskRun"],
  "payload"
> & {
  payload: TPayload | null;
};

export type DeploymentTaskInput = {
  task: Pick<TaskDefinition, "id" | "queue" | "retry" | "timeoutMs">;
  name?: string;
  description?: string | null;
};

export type RegisterDeploymentOptions = {
  version: string;
  image: string;
  tasks: readonly DeploymentTaskInput[];
};

export type RegisteredDeployment = CreateDeploymentResponse["deployment"];

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
  const parsedBody = ApiErrorResponseSchema.safeParse(body);

  if (parsedBody.success) {
    return parsedBody.data.error.message;
  }

  const candidate = body as CascadeErrorResponse;
  if (typeof candidate?.error?.message === "string") {
    return candidate.error.message;
  }

  return "Cascade API request failed";
}

function getErrorCode(body: unknown) {
  const parsedBody = ApiErrorResponseSchema.safeParse(body);

  if (parsedBody.success) {
    return parsedBody.data.error.code;
  }

  const candidate = body as CascadeErrorResponse;
  if (typeof candidate?.error?.code === "string") {
    return candidate.error.code;
  }

  return "CASCADE_API_ERROR";
}

function getTraceFlags(spanContext: SpanContext): "00" | "01" {
  return spanContext.traceFlags & TraceFlags.SAMPLED ? "01" : "00";
}

function getActiveTraceparent() {
  const spanContext = trace.getSpanContext(context.active());

  if (!spanContext || !isSpanContextValid(spanContext)) {
    return undefined;
  }

  return toTraceparent({
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: getTraceFlags(spanContext),
  });
}

export function createCascadeClient(options: CascadeClientOptions) {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const fetchImplementation = getFetch(options.fetch);

  async function request<TResponse>(
    path: string,
    init: RequestInit,
    responseSchema: ApiResponseSchema<TResponse>,
  ) {
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

    return parseApiResponse(responseSchema, body);
  }

  return {
    async triggerTask<TPayload extends JsonValue, TOutput extends JsonValue | void>(
      taskDefinition: TaskDefinition<TPayload, TOutput>,
      triggerOptions: TriggerTaskOptions<TPayload> = {},
    ) {
      const traceparent =
        triggerOptions.traceparent ??
        getActiveTraceparent() ??
        createRootTraceContext().traceparent;

      const response = await request(
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
        TriggerTaskRunResponseSchema,
      );

      return {
        ...response.taskRun,
        payload: response.taskRun.payload as TPayload | null,
      };
    },

    async registerDeployment(deployment: RegisterDeploymentOptions): Promise<RegisteredDeployment> {
      const response = await request(
        "/api/deployments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            version: deployment.version,
            image: deployment.image,
            tasks: deployment.tasks.map(({ task: taskDefinition, name, description }) => ({
              slug: taskDefinition.id,
              name: name ?? taskDefinition.id,
              description: description ?? null,
              executionConfig: {
                schemaVersion: 1,
                timeoutMs: taskDefinition.timeoutMs,
                retry: taskDefinition.retry,
                queue: taskDefinition.queue,
              },
            })),
          }),
        },
        CreateDeploymentResponseSchema,
      );

      return response.deployment;
    },
  };
}
