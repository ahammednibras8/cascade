import { describe, expect, it, vi } from "vitest";
import { CascadeApiError, createCascadeClient, defineTask } from "../src/index.js";
import {
  context,
  ROOT_CONTEXT,
  trace,
  TraceFlags,
  type Context,
  type ContextManager,
} from "@opentelemetry/api";

class TestContextManager implements ContextManager {
  private activeContext = ROOT_CONTEXT;

  active() {
    return this.activeContext;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    activeContext: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previousContext = this.activeContext;
    this.activeContext = activeContext;

    try {
      return fn.call(thisArg, ...args);
    } finally {
      this.activeContext = previousContext;
    }
  }

  bind<T>(_activeContext: Context, target: T) {
    return target;
  }

  enable() {
    return this;
  }

  disable() {
    this.activeContext = ROOT_CONTEXT;
    return this;
  }
}

describe("defineTask", () => {
  it("creates a normalized task definition", () => {
    const task = defineTask({
      id: "hello",
      run() {
        return {
          ok: true,
        };
      },
    });

    expect(task.id).toBe("hello");
    expect(task.retry.maxAttempts).toBe(1);
    expect(task.queue.name).toBe("hello");
    expect(task.timeoutMs).toBe(300_000);
  });
});

it("triggers a task run by task slug", async () => {
  const fetchMock = vi.fn<typeof fetch>(
    async (_url, _init) =>
      new Response(
        JSON.stringify({
          idempotentReplayed: false,
          taskRun: {
            id: "run-1",
            taskId: "task-1",
            taskSlug: "hello",
            taskName: "Hello",
            status: "PENDING",
            payload: {
              name: "Ahammed",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            idempotentReplay: false,
            traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
          },
        }),
        {
          status: 202,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
  );

  const client = createCascadeClient({
    baseUrl: "http://localhost:3001/",
    apiKey: "csc_test_key",
    fetch: fetchMock,
  });

  const helloTask = defineTask<{ name: string }>({
    id: "hello",
    run() {
      return {
        ok: true,
      };
    },
  });

  const run = await client.triggerTask(helloTask, {
    payload: {
      name: "Ahammed",
    },
  });

  expect(run.id).toBe("run-1");

  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/tasks/slug/hello/trigger",
    expect.objectContaining({
      method: "POST",
    }),
  );
});

it("uses the active OpenTelemetry traceparent when triggering a task", async () => {
  context.setGlobalContextManager(new TestContextManager());

  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          idempotentReplayed: false,
          taskRun: {
            id: "run-1",
            taskId: "task-1",
            taskSlug: "hello",
            taskName: "Hello",
            status: "PENDING",
            payload: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            idempotentReplay: false,
            traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
          },
        }),
        { status: 202 },
      ),
  );

  const client = createCascadeClient({
    baseUrl: "http://localhost:3001",
    apiKey: "test-key",
    fetch: fetchMock,
  });

  const activeContext = trace.setSpanContext(context.active(), {
    traceId: "11111111111111111111111111111111",
    spanId: "2222222222222222",
    traceFlags: TraceFlags.SAMPLED,
  });

  try {
    await context.with(activeContext, async () => {
      await client.triggerTask(
        defineTask({
          id: "hello",
          run() {
            return { ok: true };
          },
        }),
      );
    });
  } finally {
    context.disable();
  }

  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/tasks/slug/hello/trigger",
    expect.objectContaining({
      headers: expect.objectContaining({
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
      }),
    }),
  );
});

it("throws CascadeApiError for API errors", async () => {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          },
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
  );

  const client = createCascadeClient({
    baseUrl: "http://localhost:3001",
    apiKey: "bad-key",
    fetch: fetchMock,
  });

  const helloTask = defineTask<{ name: string }>({
    id: "hello",
    run() {
      return {
        ok: true,
      };
    },
  });

  await expect(
    client.triggerTask(helloTask, {
      payload: {
        name: "Ahammed",
      },
    }),
  ).rejects.toMatchObject({
    name: "CascadeApiError",
    status: 401,
    code: "UNAUTHORIZED",
    message: "Invalid API key",
  });

  await expect(
    client.triggerTask(helloTask, {
      payload: {
        name: "Ahammed",
      },
    }),
  ).rejects.toBeInstanceOf(CascadeApiError);
});
