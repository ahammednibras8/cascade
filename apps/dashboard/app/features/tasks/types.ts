export type Task = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  deployment: {
    id: string;
    version: string;
    status: string;
  } | null;
  runsCount: number;
  schedulesCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskExecutionConfig = {
  schemaVersion: number;
  timeoutMs: number | null;
  retry: {
    maxAttempts: number;
    delayMs: number;
    exponentialBackoff: boolean;
  };
  queue: {
    name: string;
    concurrencyLimit: number | null;
  };
};

export type TaskDetailSchedule = {
  id: string;
  name: string;
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string;
  enabled: boolean;
  hasPayload: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskRecentRun = {
  id: string;
  status: string;
  deploymentId: string | null;
  scheduleId: string | null;
  attemptsCount: number;
  eventsCount: number;
  createdAt: string;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
};

export type TaskDetail = Omit<Task, "deployment"> & {
  executionConfig: TaskExecutionConfig | null;
  deployment: {
    id: string;
    version: string;
    image: string;
    status: string;
    runtimeStatus: string;
  } | null;
  schedules: TaskDetailSchedule[];
  recentRuns: TaskRecentRun[];
};
