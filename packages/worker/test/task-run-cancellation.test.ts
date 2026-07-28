import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  taskRun: {
    findUnique: vi.fn<(args: unknown) => Promise<{ status: string } | null>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  prisma,
}));

const { isTaskRunCanceled, startTaskRunCancellationWatcher } =
  await import("../src/task-run-cancellation.js");

describe("task run cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects canceled task runs from the database", async () => {
    prisma.taskRun.findUnique.mockResolvedValue({
      status: "CANCELED",
    });

    await expect(isTaskRunCanceled("run-1")).resolves.toBe(true);

    expect(prisma.taskRun.findUnique).toHaveBeenCalledWith({
      where: {
        id: "run-1",
      },
      select: {
        status: true,
      },
    });
  });

  it("does not treat missing or non-canceled task runs as canceled", async () => {
    prisma.taskRun.findUnique.mockResolvedValueOnce({
      status: "EXECUTING",
    });
    prisma.taskRun.findUnique.mockResolvedValueOnce(null);

    await expect(isTaskRunCanceled("run-1")).resolves.toBe(false);
    await expect(isTaskRunCanceled("run-2")).resolves.toBe(false);
  });

  it("aborts immediately when the run is already canceled", async () => {
    prisma.taskRun.findUnique.mockResolvedValue({
      status: "CANCELED",
    });

    const abortController = new AbortController();
    const stop = await startTaskRunCancellationWatcher({
      taskRunId: "run-1",
      abortController,
    });

    expect(abortController.signal.aborted).toBe(true);
    expect(abortController.signal.reason).toMatchObject({
      name: "TaskRunCanceledError",
      code: "RUN_CANCELED",
      taskRunId: "run-1",
    });

    stop();
  });

  it("polls until the run becomes canceled", async () => {
    vi.useFakeTimers();

    prisma.taskRun.findUnique
      .mockResolvedValueOnce({
        status: "EXECUTING",
      })
      .mockResolvedValueOnce({
        status: "CANCELED",
      });

    const abortController = new AbortController();
    const stop = await startTaskRunCancellationWatcher({
      taskRunId: "run-1",
      abortController,
    });

    expect(abortController.signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(500);

    expect(abortController.signal.aborted).toBe(true);

    stop();
  });
});
