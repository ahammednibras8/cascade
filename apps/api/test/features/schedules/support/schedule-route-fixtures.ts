import { TASK_ID } from "../../support/route-test-app.js";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
export const SCHEDULE_ID = "33333333-3333-4333-8333-333333333333";

export function createTaskScheduleSuccess() {
  return {
    ok: true,
    status: 201,
    schedule: {
      id: SCHEDULE_ID,
      taskId: TASK_ID,
      name: "Every minute",
      intervalSeconds: 60,
      nextRunAt: "2026-01-01T00:01:00.000Z",
      enabled: true,
      payload: {
        message: "scheduled hello",
      },
      createdAt: CREATED_AT,
    },
  };
}

export function createListTaskSchedulesSuccess() {
  return {
    ok: true,
    status: 200,
    pagination: {
      limit: 50,
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    },
    schedules: [
      {
        id: "schedule-1",
        taskId: "task-1",
        name: "Weekday morning",
        scheduleType: "CRON",
        intervalSeconds: null,
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Kolkata",
        nextRunAt: "2026-01-03T09:00:00.000Z",
        lastRunAt: null,
        enabled: true,
        hasPayload: true,
        revision: 3,
        createdAt: CREATED_AT,
        updatedAt: "2026-01-02T00:00:00.000Z",
        task: {
          id: "task-1",
          slug: "hello",
          name: "Hello",
          deployment: {
            id: "deployment-1",
            version: "v3",
            status: "ACTIVE",
          },
        },
      },
    ],
  };
}

export function createPauseTaskScheduleSuccess() {
  return {
    ok: true,
    status: 200,
    schedule: {
      id: SCHEDULE_ID,
      enabled: false,
      alreadyPaused: false,
    },
  };
}

export function createResumeTaskScheduleSuccess() {
  return {
    ok: true,
    status: 200,
    schedule: {
      id: SCHEDULE_ID,
      enabled: true,
      alreadyResumed: false,
      nextRunAt: "2026-01-01T00:01:00.000Z",
    },
  };
}

export function createDeleteTaskScheduleSuccess() {
  return {
    ok: true,
    status: 204,
  };
}

export function createUpdateTaskScheduleSuccess() {
  return {
    ok: true,
    status: 200,
    schedule: {
      id: SCHEDULE_ID,
      name: "Every two minutes",
      scheduleType: "INTERVAL",
      intervalSeconds: 120,
      cronExpression: null,
      timezone: "UTC",
      nextRunAt: "2026-01-01T00:02:00.000Z",
      enabled: true,
      hasPayload: false,
      revision: 2,
    },
  };
}

export function createGetTaskScheduleSuccess() {
  return {
    ok: true,
    status: 200,
    schedule: {
      id: SCHEDULE_ID,
      taskId: "task-1",
      name: "Every minute",
      scheduleType: "INTERVAL",
      intervalSeconds: 60,
      cronExpression: null,
      timezone: "UTC",
      nextRunAt: CREATED_AT,
      lastRunAt: null,
      enabled: true,
      payload: {
        message: "hello",
      },
      revision: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      task: {
        id: "task-1",
        slug: "hello",
        name: "Hello",
      },
    },
  };
}
