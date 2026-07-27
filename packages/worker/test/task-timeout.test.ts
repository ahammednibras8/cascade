import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithTaskTimeout } from "../src/task-timeout.js";

describe("runWithTaskTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns task output when the task completes before timeout", async () => {
    const result = await runWithTaskTimeout({
      timeoutMs: 1000,
      run: () => ({
        ok: true,
      }),
    });

    expect(result).toEqual({
      ok: true,
    });
  });

  it("rejects and aborts the task when timeout is reached", async () => {
    vi.useFakeTimers();

    let receivedSignal: AbortSignal | undefined;

    const promise = runWithTaskTimeout({
      timeoutMs: 1000,
      run: (signal) => {
        receivedSignal = signal;

        return new Promise(() => {});
      },
    });

    const timeoutErrorPromise = promise.then(
      () => {
        throw new Error("Expected task timeout");
      },
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(1000);

    await expect(timeoutErrorPromise).resolves.toMatchObject({
      name: "TaskTimeoutError",
      code: "TASK_TIMEOUT",
      timeoutMs: 1000,
      message: "Task exceeded timeout of 1000ms",
    });

    expect(receivedSignal?.aborted).toBe(true);
    expect(receivedSignal?.reason).toMatchObject({
      name: "TaskTimeoutError",
      code: "TASK_TIMEOUT",
      timeoutMs: 1000,
    });
  });

  it("does not timeout when timeoutMs is null", async () => {
    vi.useFakeTimers();

    const resultPromise = runWithTaskTimeout({
      timeoutMs: null,
      run: async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 10_000);
        });

        return {
          ok: true,
        };
      },
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
    });
  });
});
