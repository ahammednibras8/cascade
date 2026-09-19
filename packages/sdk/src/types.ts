export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  traceFlags: "00" | "01";
  traceparent: string;
};

export type TaskLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type TaskLogger = {
  debug: (message: string, data?: JsonValue) => Promise<void>;
  info: (message: string, data?: JsonValue) => Promise<void>;
  warn: (message: string, data?: JsonValue) => Promise<void>;
  error: (message: string, data?: JsonValue) => Promise<void>;
};

export type TaskRunContext<TPayload extends JsonValue = JsonValue> = {
  runId: string;
  taskId: string;
  environmentId: string;
  payload: TPayload | null;
  logger: TaskLogger;
  signal: AbortSignal;
  trace: TraceContext;
};

export type TaskRunOutput = JsonValue | void;

export type TaskRetryConfig = {
  maxAttempts: number;
  delayMs: number;
  exponentialBackoff: boolean;
};

export type TaskQueueConfig = {
  name: string;
  concurrencyLimit: number | null;
};

export type TaskDefinitionInput<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
> = {
  id: string;
  retry?: Partial<TaskRetryConfig>;
  queue?: Partial<TaskQueueConfig>;
  timeoutMs?: number | null;
  run: (context: TaskRunContext<TPayload>) => TOutput | Promise<TOutput>;
};

export type TaskDefinition<
  TPayload extends JsonValue = JsonValue,
  TOutput extends TaskRunOutput = TaskRunOutput,
> = {
  id: string;
  retry: TaskRetryConfig;
  queue: TaskQueueConfig;
  timeoutMs: number | null;
  run: (context: TaskRunContext<TPayload>) => TOutput | Promise<TOutput>;
};

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

export type TaskRunStatus = "PENDING" | "EXECUTING" | "COMPLETED" | "FAILED" | "CANCELED";

export type TriggerTaskRunResponse<TPayload extends JsonValue = JsonValue> = {
  id: string;
  taskId: string;
  taskSlug: string;
  taskName: string;
  status: TaskRunStatus;
  payload: TPayload | null;
  createdAt: string;
  idempotentReplay: boolean;
  traceparent: string;
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

export type DeploymentStatus = "ACTIVE" | "INACTIVE" | "FAILED";

export type RegisteredDeployment = {
  id: string;
  environmentId: string;
  version: string;
  image: string;
  status: DeploymentStatus;
  tasks: Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  createdAt: string;
};
