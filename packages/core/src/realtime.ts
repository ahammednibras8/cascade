export const RUN_EVENT_CHANNEL_PREFIX = "cascade:realtime:run";
export const ENVIRONMENT_RUNS_CHANNEL_PREFIX = "cascade:realtime:environment-runs";

export type RunEventNotification = {
  eventId: string;
};

export function getRunEventChannel(runId: string) {
  return `${RUN_EVENT_CHANNEL_PREFIX}:${runId}`;
}

export function getEnvironmentRunsChannel(environmentId: string) {
  return `${ENVIRONMENT_RUNS_CHANNEL_PREFIX}:${environmentId}`;
}

export function serializeRunEventNotification(notification: RunEventNotification) {
  return JSON.stringify(notification);
}

export function parseRunEventNotification(value: string): RunEventNotification | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !("eventId" in parsed) ||
      typeof parsed.eventId !== "string"
    ) {
      return null;
    }

    return {
      eventId: parsed.eventId,
    };
  } catch {
    return null;
  }
}
