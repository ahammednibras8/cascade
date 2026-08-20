export type EnvironmentRunsStreamState = "connecting" | "connected" | "reconnecting";

type EnvironmentRunsEventSource = {
  addEventListener(event: string, listener: () => void): void;
  removeEventListener(event: string, listener: () => void): void;
  close(): void;
};

type ConnectEnvironmentRunsStreamInput = {
  onRunsChanged: () => void;
  onStateChange: (state: EnvironmentRunsStreamState) => void;
  createEventSource?: (url: string) => EnvironmentRunsEventSource;
};

export function getEnvironmentRunsStreamPath() {
  return "/runs/stream";
}

export function connectEnvironmentRunsStream(input: ConnectEnvironmentRunsStreamInput) {
  input.onStateChange("connecting");

  const createEventSource = input.createEventSource ?? ((url: string) => new EventSource(url));
  const eventSource = createEventSource(getEnvironmentRunsStreamPath());

  const handleOpen = () => {
    input.onStateChange("connected");
  };

  const handleError = () => {
    input.onStateChange("reconnecting");
  };

  const handleRunsChanged = () => {
    input.onRunsChanged();
  };

  eventSource.addEventListener("open", handleOpen);
  eventSource.addEventListener("error", handleError);
  eventSource.addEventListener("runs-changed", handleRunsChanged);

  return () => {
    eventSource.removeEventListener("open", handleOpen);
    eventSource.removeEventListener("error", handleError);
    eventSource.removeEventListener("runs-changed", handleRunsChanged);
    eventSource.close();
  };
}
