export type ScheduleTask = {
  id: string;
  slug: string;
  name: string;
};

export type Schedule = {
  id: string;
  taskId: string;
  name: string;
  scheduleType: "INTERVAL" | "CRON";
  intervalSeconds: number | null;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  enabled: boolean;
  hasPayload?: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  payload?: unknown;
  task: ScheduleTask & {
    deployment?: {
      id: string;
      version: string;
      status: string;
    } | null;
  };
};

export type ScheduleActionData =
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    }
  | undefined;
