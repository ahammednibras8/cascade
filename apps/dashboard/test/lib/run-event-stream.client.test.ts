import { describe, expect, it, vi } from "vitest";
import {
  connectRunEventStream,
  getRunEventStreamPath,
  type RunEventStreamState,
} from "../../app/lib/run-event-stream.js";

type Listener = () => void;

function createEventSourceStub() {
  const listeners = new Map<string, Set<Listener>>();

  const eventSource = {
    addEventListener: vi.fn<(event: string, listener: Listener) => void>((event, listener) => {
      const eventListeners = listeners.get(event) ?? new Set<Listener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    }),
    removeEventListener: vi.fn<(event: string, listener: Listener) => void>((event, listener) => {
      listeners.get(event)?.delete(listener);
    }),
    close: vi.fn<() => void>(),
    emit(event: string) {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
    },
  };

  return eventSource;
}

describe("run event stream client", () => {
  it("creates the same-origin stream path", () => {
    expect(getRunEventStreamPath("run/with spaces")).toBe(
      "/runs/run%2Fwith%20spaces/events/stream",
    );
  });

  it("revalidates on run events and closes the stream on cleanup", () => {
    const eventSource = createEventSourceStub();
    const createEventSource = vi.fn<(url: string) => typeof eventSource>(() => eventSource);
    const onRunEvent = vi.fn<() => void>();
    const onStateChange = vi.fn<(state: RunEventStreamState) => void>();

    const stop = connectRunEventStream({
      runId: "run-1",
      onRunEvent,
      onStateChange,
      createEventSource,
    });

    expect(createEventSource).toHaveBeenCalledWith("/runs/run-1/events/stream");
    expect(onStateChange).toHaveBeenCalledWith("connecting");

    eventSource.emit("open");
    eventSource.emit("run-event");
    eventSource.emit("error");

    expect(onStateChange).toHaveBeenCalledWith("connected");
    expect(onRunEvent).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledWith("reconnecting");

    stop();

    expect(eventSource.close).toHaveBeenCalledOnce();
    expect(eventSource.removeEventListener).toHaveBeenCalledTimes(3);
  });
});
