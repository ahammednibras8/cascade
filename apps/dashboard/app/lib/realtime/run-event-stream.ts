export type RunEventStreamState = "connecting" | "connected" | "reconnecting";

type RunEventStreamEventSource = {
  addEventListener(event: string, listener: () => void): void;
  removeEventListener(event: string, listener: () => void): void;
  close(): void;
};

type ConnectRunEventStreamInput = {
  runId: string;
  onRunEvent: () => void;
  onStateChange: (state: RunEventStreamState) => void;
  createEventSource?: (url: string) => RunEventStreamEventSource;
};

export function getRunEventStreamPath(runId: string) {
  return `/runs/${encodeURIComponent(runId)}/events/stream`;
}

export function connectRunEventStream(input: ConnectRunEventStreamInput) {
  input.onStateChange("connecting");

  const createEventSource = input.createEventSource ?? ((url: string) => new EventSource(url));
  const eventSource = createEventSource(getRunEventStreamPath(input.runId));

  const handleOpen = () => {
    input.onStateChange("connected");
  };

  const handleError = () => {
    // EventSource automatically reconnects and sends Last-Event-ID.
    input.onStateChange("reconnecting");
  };

  const handleRunEvent = () => {
    input.onRunEvent();
  };

  eventSource.addEventListener("open", handleOpen);
  eventSource.addEventListener("error", handleError);
  eventSource.addEventListener("run-event", handleRunEvent);

  return () => {
    eventSource.removeEventListener("open", handleOpen);
    eventSource.removeEventListener("error", handleError);
    eventSource.removeEventListener("run-event", handleRunEvent);
    eventSource.close();
  };
}
