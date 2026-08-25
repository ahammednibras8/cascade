import { describe, expect, it, vi } from "vitest";
import {
  connectEnvironmentRunsStream,
  getEnvironmentRunsStreamPath,
  type EnvironmentRunsStreamState,
} from "../../../app/lib/realtime/environment-runs-stream.js";

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

describe("environment runs stream client", () => {
  it("uses the same-origin runs stream path", () => {
    expect(getEnvironmentRunsStreamPath()).toBe("/runs/stream");
  });

  it("revalidates on runs-changed and closes on cleanup", () => {
    const eventSource = createEventSourceStub();
    const createEventSource = vi.fn<(url: string) => typeof eventSource>(() => eventSource);
    const onRunsChanged = vi.fn<() => void>();
    const onStateChange = vi.fn<(state: EnvironmentRunsStreamState) => void>();

    const stop = connectEnvironmentRunsStream({
      onRunsChanged,
      onStateChange,
      createEventSource,
    });

    expect(createEventSource).toHaveBeenCalledWith("/runs/stream");
    expect(onStateChange).toHaveBeenCalledWith("connecting");

    eventSource.emit("open");
    eventSource.emit("runs-changed");
    eventSource.emit("error");

    expect(onStateChange).toHaveBeenCalledWith("connected");
    expect(onRunsChanged).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledWith("reconnecting");

    stop();

    expect(eventSource.close).toHaveBeenCalledOnce();
    expect(eventSource.removeEventListener).toHaveBeenCalledTimes(3);
  });
});
