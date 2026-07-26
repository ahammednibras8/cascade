import { describe, expect, it, vi } from "vitest";
import { createTaskRegistry, task } from "./task.js";

describe("task", () => {
  it("creates a task definition with defaults", async () => {
    const run = vi.fn<() => Promise<{ ok: true }>>().mockResolvedValue({ ok: true });

    const definition = task({
      id: "hello",
      run,
    });

    expect(definition.id).toBe("hello");
    expect(definition.run).toBe(run);

    expect(definition.retry).toEqual({
      maxAttempts: 1,
      delayMs: 0,
      exponentialBackoff: false,
    });

    expect(definition.queue).toEqual({
      name: "hello",
      concurrencyLimit: null,
    });

    expect(definition.timeoutMs).toBe(300_000);
  });

  it("normalizes custom retry, queue, and timeout config", () => {
    const run = vi.fn<() => void>();

    const definition = task({
      id: "send-email",
      retry: {
        maxAttempts: 3,
        delayMs: 1000,
        exponentialBackoff: true,
      },
      queue: {
        name: "email",
        concurrencyLimit: 5,
      },
      timeoutMs: 60_000,
      run,
    });

    expect(definition.retry).toEqual({
      maxAttempts: 3,
      delayMs: 1000,
      exponentialBackoff: true,
    });

    expect(definition.queue).toEqual({
      name: "email",
      concurrencyLimit: 5,
    });

    expect(definition.timeoutMs).toBe(60_000);
  });

  it("allows timeout to be disabled with null", () => {
    const definition = task({
      id: "no-timeout",
      timeoutMs: null,
      run: vi.fn<() => void>(),
    });

    expect(definition.timeoutMs).toBeNull();
  });

  it("rejects invalid retry config", () => {
    expect(() =>
      task({
        id: "bad-retry",
        retry: {
          maxAttempts: 0,
        },
        run: vi.fn<() => void>(),
      }),
    ).toThrow("retry.maxAttempts must be an integer greater than or equal to 1");

    expect(() =>
      task({
        id: "bad-delay",
        retry: {
          delayMs: -1,
        },
        run: vi.fn<() => void>(),
      }),
    ).toThrow("retry.delayMs must be an integer greater than or equal to 0");
  });

  it("rejects invalid queue config", () => {
    expect(() =>
      task({
        id: "bad-queue",
        queue: {
          name: "",
        },
        run: vi.fn<() => void>(),
      }),
    ).toThrow("queue.name must not be empty");

    expect(() =>
      task({
        id: "bad-concurrency",
        queue: {
          concurrencyLimit: 0,
        },
        run: vi.fn<() => void>(),
      }),
    ).toThrow("queue.concurrencyLimit must be an integer greater than or equal to 1");
  });

  it("rejects invalid timeout config", () => {
    expect(() =>
      task({
        id: "bad-timeout",
        timeoutMs: 0,
        run: vi.fn<() => void>(),
      }),
    ).toThrow("timeoutMs must be null or an integer greater than or equal to 1");
  });
});

describe("createTaskRegistry", () => {
  it("stores and returns tasks by id", () => {
    const helloTask = task({
      id: "hello",
      run: vi.fn<() => void>(),
    });

    const goodbyeTask = task({
      id: "goodbye",
      run: vi.fn<() => void>(),
    });

    const registry = createTaskRegistry([helloTask, goodbyeTask]);

    expect(registry.has("hello")).toBe(true);
    expect(registry.has("missing")).toBe(false);

    expect(registry.get("hello")).toBe(helloTask);
    expect(registry.get("missing")).toBeUndefined();

    expect(registry.list()).toEqual([helloTask, goodbyeTask]);
  });

  it("rejects duplicate task ids", () => {
    const firstTask = task({
      id: "hello",
      run: vi.fn<() => void>(),
    });

    const duplicateTask = task({
      id: "hello",
      run: vi.fn<() => void>(),
    });

    expect(() => createTaskRegistry([firstTask, duplicateTask])).toThrow(
      "Duplicate task id: hello",
    );
  });
});
