export type TaskRunAttempt = {
  id: string;
  attemptNumber: number;
  status: string;
  error: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type TaskRunEvent = {
  id: string;
  taskAttemptId: string | null;
  type: string;
  level: string;
  message: string | null;
  data: unknown;
  createdAt: string;
  traceId: string | null;
  spanId: string | null;
  parentSpanId: string | null;
};

export type TaskRunDetail = {
  id: string;
  status: string;
  payload: unknown;
  output: unknown;
  error: unknown;
  traceId: string | null;
  triggerSpanId: string | null;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  task: {
    id: string;
    slug: string;
    name: string;
    environment: {
      id: string;
      slug: string;
      name: string;
      project: {
        id: string;
        slug: string;
        name: string;
      };
    };
  };
  attempts: TaskRunAttempt[];
  events: TaskRunEvent[];
};

export type TaskRunListItem = {
  id: string;
  status: string;
  taskSlug: string;
  taskName: string;
  environmentSlug: string;
  projectSlug: string;
  projectName: string;
  attemptsCount: number;
  eventsCount: number;
  createdAt: string;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
};
